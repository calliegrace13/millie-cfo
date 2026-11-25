begin;
alter table finance_ai_settings add column credits_first boolean not null default false,add column routing_revision integer not null default 1;
alter table finance_ai_credits add column blocked_required_micros bigint not null default 0 check(blocked_required_micros>=0);

create or replace function finance_ai_credit_status(_owner uuid,_provider text) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('amountMicros',amount_micros,'remainingMicros',greatest(0,amount_micros-greatest(0,finance_ai_credit_used(owner_id,provider)-baseline_micros)),
 'expiresOn',expires_on,'expired',now()>=(expires_on+1)::timestamp at time zone 'UTC','blockedRequiredMicros',blocked_required_micros,'recordedAt',recorded_at,'revision',revision)
 from finance_ai_credits where owner_id=_owner and provider=_provider;
$$;

-- Select only connected, priced models with unexpired, recorded credit that can
-- cover the last task maximum. No untracked/pay-as-you-go fallback is implied.
create function finance_ai_credit_pick(_owner uuid) returns text language sql stable security definer set search_path=public,pg_temp as $$
 select c.provider from finance_ai_connections c join finance_ai_credits g using(owner_id,provider)
 join finance_ai_prices p on p.provider=c.provider and p.model=c.model and p.valid_until>now()
 left join finance_ai_settings s on s.owner_id=c.owner_id
 where c.owner_id=_owner and now()<(g.expires_on+1)::timestamp at time zone 'UTC'
 and (finance_ai_credit_status(c.owner_id,c.provider)->>'remainingMicros')::bigint>=greatest(1,g.blocked_required_micros)
 order by g.expires_on,(c.provider is not distinct from s.active_provider) desc,c.provider limit 1;
$$;
revoke all on function finance_ai_credit_pick(uuid) from public,anon,authenticated;

create function finance_set_ai_credit_routing(_automatic boolean,_expected integer) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid();begin
 if u is null or _automatic is null or _expected is null then raise exception 'Choose your credit routing mode';end if;
 perform pg_advisory_xact_lock(hashtextextended('ai:'||u::text,0));
 update finance_ai_settings set credits_first=_automatic,routing_revision=routing_revision+1,updated_at=now() where owner_id=u and routing_revision=_expected;
 if not found then raise exception 'Your routing mode changed. Refresh before saving';end if;
 update finance_autopilot_settings set next_run_at=now(),updated_at=now()
 where owner_id=u and enabled and background_enabled and lease is null and failure_count<3;
end;$$;
-- Advance only after a credit reservation was rejected BEFORE sending. Any
-- metered stage (including research) must recover on its original provider.
create function finance_ai_advance_credit(_owner uuid,_lease uuid,_required bigint) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare s finance_autopilot_settings;begin
 if _owner is null or _lease is null or _required is null or _required<0 then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended('ai:'||_owner::text,0));
 select * into s from finance_autopilot_settings where owner_id=_owner and lease=_lease and lease_until>clock_timestamp() for update;
 if not found or not s.enabled or not exists(select 1 from finance_ai_settings where owner_id=_owner and credits_first) then return false;end if;
 if exists(select 1 from finance_ai_receipt_runs where owner_id=_owner and status='running' and started_at>now()-interval '10 minutes') then return false;end if;
 if exists(select 1 from finance_autopilot_work w where w.owner_id=_owner and w.status='running' and exists(select 1 from finance_ai_charges c where c.owner_id=_owner and c.started_at>=w.created_at and c.state<>'released')) then return false;end if;
 update finance_ai_credits set blocked_required_micros=greatest(blocked_required_micros,_required,1) where owner_id=_owner and provider=s.provider;
 update finance_autopilot_work set status='skipped',summary='Credit could not cover this task. No paid request was sent; upcoming work can use the next credit.',result='{"modelSwitchedBeforeSend":true}',updated_at=now() where owner_id=_owner and status='running';
 update finance_autopilot_settings set lease=null,lease_until=null,status='ready',next_run_at=now(),last_finished_at=clock_timestamp(),updated_at=clock_timestamp(),summary='Checking the next available credit before another paid task.' where owner_id=_owner;
 return true;
end;$$;
revoke all on function finance_ai_advance_credit(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function finance_ai_advance_credit(uuid,uuid,bigint) to service_role;

-- Route at a task boundary, before issuing a lease. Holds and recoverable paid
-- work pin the original provider. The normal reservation still checks both
-- shared dollar limits, optional count caps and pricing before each paid call.
create or replace function finance_autopilot_begin(_owner uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s finance_autopilot_settings;c finance_ai_connections;chosen text;l uuid:=gen_random_uuid();begin
 perform pg_advisory_xact_lock(hashtextextended('ai:'||_owner::text,0));
 select * into s from finance_autopilot_settings where owner_id=_owner for update;
 if not found or not s.enabled then return jsonb_build_object('paused',true);end if;
 if s.lease_until>clock_timestamp() or exists(select 1 from finance_ai_receipt_runs where owner_id=_owner and status='running' and started_at>now()-interval '10 minutes') then return jsonb_build_object('busy',true);end if;
 if exists(select 1 from finance_ai_settings where owner_id=_owner and credits_first)
 and not exists(select 1 from finance_autopilot_work w where w.owner_id=_owner and w.status='running' and exists(select 1 from finance_ai_charges q where q.owner_id=_owner and q.started_at>=w.created_at and q.state<>'released')) then
  chosen:=finance_ai_credit_pick(_owner);
  if chosen is null then
   update finance_autopilot_settings set status='limit',next_run_at='infinity',summary='Your AI credits are unavailable, expired, or cannot cover the next task. Add or refresh a credit to resume; your dollar limits are unchanged.',updated_at=clock_timestamp() where owner_id=_owner;
   return jsonb_build_object('status','limit','summary','Your AI credits need an update before new paid work.');
  end if;
  select * into c from finance_ai_connections where owner_id=_owner and provider=chosen;
  if s.provider is distinct from c.provider or s.model is distinct from c.model then
   update finance_autopilot_work set status='skipped',summary='An earlier-expiring credit was selected before any paid call.',result='{"modelSwitchedBeforeSend":true}',updated_at=now() where owner_id=_owner and status='running';
   update finance_autopilot_settings set provider=c.provider,model=c.model,revision=revision+1 where owner_id=_owner returning * into s;
  end if;
  update finance_ai_settings set active_provider=c.provider,updated_at=now() where owner_id=_owner and active_provider is distinct from c.provider;
 end if;
 update finance_autopilot_settings set lease=l,lease_until=clock_timestamp()+interval '5 minutes',status='working',last_started_at=clock_timestamp(),updated_at=clock_timestamp() where owner_id=_owner;
 return jsonb_build_object('lease',l,'provider',s.provider,'model',s.model,'revision',s.revision,'workflow_scope',s.workflow_scope);
end;$$;
revoke all on function finance_set_ai_credit_routing(boolean,integer) from public,anon,authenticated;
grant execute on function finance_set_ai_credit_routing(boolean,integer) to authenticated;

create or replace function finance_set_ai_credit(_provider text,_amount bigint,_expires date,_expected integer) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); actual integer; baseline bigint;begin
 if u is null or _provider not in('openai','anthropic') or _amount is null or _amount not between 0 and 1000000000 or _expires is null or _expires < (now() at time zone 'UTC')::date or _expires > (now() at time zone 'UTC')::date+3660 then raise exception 'Enter a remaining credit balance and valid expiry date';end if;
 perform pg_advisory_xact_lock(hashtextextended('ai:'||u::text,0));
 if not exists(select 1 from finance_ai_connections where owner_id=u and provider=_provider) then raise exception 'Connect this provider first';end if;
 select revision into actual from finance_ai_credits where owner_id=u and provider=_provider;
 if actual is distinct from _expected then raise exception 'Your credit changed. Refresh before saving';end if;
 select coalesce(sum(c.cost_micros),0) into baseline from finance_ai_charges c join finance_ai_receipt_runs r on r.id=c.run_id where c.owner_id=u and r.provider=_provider and c.state='settled';
 insert into finance_ai_credits(owner_id,provider,amount_micros,baseline_micros,expires_on) values(u,_provider,_amount,baseline,_expires)
 on conflict(owner_id,provider) do update set amount_micros=excluded.amount_micros,baseline_micros=excluded.baseline_micros,expires_on=excluded.expires_on,recorded_at=now(),revision=finance_ai_credits.revision+1,blocked_required_micros=0;
end;$$;
create or replace function finance_ai_status() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('automaticCredits',coalesce((select credits_first from finance_ai_settings where owner_id=auth.uid()),false),'routingRevision',coalesce((select routing_revision from finance_ai_settings where owner_id=auth.uid()),0),'active',(select active_provider from finance_ai_settings where owner_id=auth.uid()),'connections',coalesce((select jsonb_agg(jsonb_build_object('provider',c.provider,'model',c.model,'suffix',c.key_suffix,'requestLimit',c.request_limit,'requestLimitEnabled',c.request_limit_enabled,'revision',c.revision,'credit',finance_ai_credit_status(c.owner_id,c.provider),'pricingReady',exists(select 1 from finance_ai_prices p where p.provider=c.provider and p.model=c.model and p.valid_until>now()),'used',(select count(*) from finance_ai_receipt_runs r where r.owner_id=c.owner_id and r.started_at>now()-interval '24 hours')) order by c.provider) from finance_ai_connections c where c.owner_id=auth.uid()),'[]'::jsonb));
$$;
create or replace function finance_ai_next_window(_owner uuid, _required bigint) returns timestamptz
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  cap integer; cap_enabled boolean; credit jsonb; active text;
  due timestamptz := now();
  slot timestamptz;
  budget finance_ai_budgets;
  spent jsonb;
begin
  if exists(select 1 from finance_ai_settings where owner_id=_owner and credits_first) then
   active:=finance_ai_credit_pick(_owner);
   if active is null then return 'infinity';end if;
  else select active_provider into active from finance_ai_settings where owner_id=_owner;end if;
  select c.request_limit,c.request_limit_enabled into cap,cap_enabled from finance_ai_connections c
    join finance_ai_settings s on s.owner_id=c.owner_id 
    where c.owner_id=_owner and c.provider=active;
  credit:=finance_ai_credit_status(_owner,active);
  if credit is not null and ((credit->>'expired')::boolean or (credit->>'remainingMicros')::bigint<greatest(1,_required)) then return 'infinity';end if;
  if cap is null or cap < 1 then return 'infinity'; end if;
  if cap_enabled then
  select started_at + interval '24 hours' into slot from finance_ai_receipt_runs
    where owner_id=_owner and started_at > now()-interval '24 hours'
    order by started_at desc offset (cap-1) limit 1;
  due := greatest(due,slot);
  end if;
  if _required > 0 then
    select * into budget from finance_ai_budgets where owner_id=_owner;
    spent := finance_ai_spending(_owner);
    if (spent->>'held')::bigint+_required > least(coalesce(budget.daily_micros,1000000),coalesce(budget.monthly_micros,5000000)) then
      return 'infinity';
    end if;
    if (spent->>'day')::bigint+_required > coalesce(budget.daily_micros,1000000) then
      due := greatest(due,(date_trunc('day',now() at time zone 'UTC')+interval '1 day') at time zone 'UTC');
    end if;
    if (spent->>'month')::bigint+_required > coalesce(budget.monthly_micros,5000000) then
      due := greatest(due,(date_trunc('month',now() at time zone 'UTC')+interval '1 month') at time zone 'UTC');
    end if;
  end if;
  return due;
end;$$;
create or replace function finance_ai_choose(_owner uuid,_provider text,_disconnect boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if _provider not in('openai','anthropic') or _owner is null or _disconnect is null then raise exception 'Invalid provider';end if;
 perform pg_advisory_xact_lock(hashtextextended('ai:'||_owner::text,0));
 update finance_ai_settings set credits_first=false,routing_revision=routing_revision+1 where owner_id=_owner and credits_first;
 if _disconnect then
  delete from finance_ai_connections where owner_id=_owner and provider=_provider;
  update finance_ai_settings set active_provider=null,updated_at=now() where owner_id=_owner and active_provider=_provider;
 else
  if not exists(select 1 from finance_ai_connections where owner_id=_owner and provider=_provider) then raise exception 'Connect this provider first';end if;
  if (select active_provider from finance_ai_settings where owner_id=_owner) is not distinct from _provider then return;end if;
  perform finance_ai_prepare_switch(_owner);
  insert into finance_ai_settings(owner_id,active_provider) values(_owner,_provider) on conflict(owner_id) do update set active_provider=excluded.active_provider,updated_at=now();
  perform finance_ai_follow_selection(_owner);
 end if;
end;$$;

create or replace function finance_ai_reserve(_owner uuid,_request uuid,_hash text,_cache text,_bytes integer,_output integer,_research boolean,_provider text,_model text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior finance_ai_receipt_runs;c finance_ai_connections;p finance_ai_prices;b finance_ai_budgets;spent jsonb;reserve bigint;run uuid;tokens bigint;credit jsonb;long_priced boolean;rates jsonb;begin
 if _owner is null or _request is null or _hash is null or _cache is null or _hash!~'^[a-f0-9]{64}$' or _cache!~'^[a-f0-9]{64}$' or _bytes is null or _bytes not between 1 and 180000 or _output is null or _output not between 1 and 6000 or _research is null then raise exception 'Invalid cost reservation';end if;
 perform pg_advisory_xact_lock(hashtextextended('ai:'||_owner::text,0));
 select * into prior from finance_ai_receipt_runs where owner_id=_owner and request_id=_request;
 if found then
  if prior.input_hash<>_hash then raise exception 'Request ID already used';end if;
  return jsonb_build_object('id',prior.id,'status',prior.status,'result',prior.result);
 end if;
 select fc.* into c from finance_ai_connections fc join finance_ai_settings s on s.owner_id=fc.owner_id and s.active_provider=fc.provider where fc.owner_id=_owner;
 if not found then raise exception 'Connect and select an AI provider in Customize Millie';end if;
 if c.provider is distinct from _provider or c.model is distinct from _model then raise exception 'Your provider changed. No data was sent';end if;
 select * into prior from finance_ai_receipt_runs where owner_id=_owner and provider=c.provider and model=c.model and (cache_hash=_cache or input_hash=_hash) and status='succeeded' and started_at>now()-interval '30 days' order by started_at desc limit 1;
 if found then return jsonb_build_object('id',prior.id,'status',prior.status,'result',prior.result);end if;
 select * into p from finance_ai_prices where provider=c.provider and model=c.model and valid_until>clock_timestamp();
 if not found then raise exception 'Your model needs verified pricing before another paid call. Choose a priced model or ask the website owner to refresh its rates';end if;
 insert into finance_ai_budgets(owner_id) values(_owner) on conflict do nothing;select * into b from finance_ai_budgets where owner_id=_owner;
 -- UTF-8 bytes plus 4096 framing/schema tokens conservatively bound ordinary text.
 -- Search is opaque: reserve THREE full context passes, not a guessed short result.
 tokens:=case when _research then p.context_tokens::bigint*3 else _bytes+4096 end;
 long_priced:=p.provider='openai' and p.model='gpt-6.1-sol';
 rates:=to_jsonb(p)||case when long_priced then jsonb_build_object('long_context_threshold',272000,'long_input_multiplier',2,'long_output_multiplier',1.5) else '{}'::jsonb end;
 reserve:=ceil(tokens*p.input_rate*case when _research and long_priced then 2 else 1 end+_output*p.output_rate*case when _research then 3 else 1 end*case when _research and long_priced then 1.5 else 1 end+case when _research then 2*p.search_rate else 0 end);
 credit:=finance_ai_credit_status(_owner,c.provider);
 if credit is null and exists(select 1 from finance_ai_settings where owner_id=_owner and credits_first) then raise exception 'Your AI credit is not recorded for this provider. Automatic mode uses tracked credits only';end if;
 if credit is not null then
  if (credit->>'expired')::boolean then raise exception 'Your AI credit has expired. Update Models & credits or switch providers';end if;
  if (credit->>'remainingMicros')::bigint<reserve then raise exception 'Your AI credit cannot cover the next task (maximum cost $%).',to_char(reserve/1000000.0,'FM9999990.000000');end if;
 end if;
 spent:=finance_ai_spending(_owner);
 if (spent->>'day')::bigint+reserve>b.daily_micros or (spent->>'month')::bigint+reserve>b.monthly_micros then raise exception 'Your AI dollar budget cannot cover the next task (maximum cost $%).',to_char(reserve/1000000.0,'FM9999990.000000');end if;
 if c.request_limit_enabled and (select count(*) from finance_ai_receipt_runs where owner_id=_owner and started_at>now()-interval '24 hours')>=c.request_limit then raise exception 'Your request limit for the last 24 hours has been reached';end if;
 if exists(select 1 from finance_ai_receipt_runs where owner_id=_owner and status='running' and started_at>now()-interval '10 minutes') then raise exception 'An analysis is already running. Wait before starting another';end if;
 insert into finance_ai_receipt_runs(owner_id,request_id,input_hash,cache_hash,provider,model) values(_owner,_request,_hash,_cache,c.provider,c.model) returning id into run;
 insert into finance_ai_charges(run_id,owner_id,reserved_micros,rates,stage) values(run,_owner,reserve,rates,case when _research then 'research' else 'analysis' end);
 return jsonb_build_object('id',run,'status','new','provider',c.provider,'model',c.model,'credential',c.credential,'reservedMicros',reserve);
end;$$;
create trigger finance_routing_window_changed after update of credits_first on finance_ai_settings for each row when (old.credits_first is distinct from new.credits_first) execute function finance_ai_credit_window_changed();
revoke all on function finance_autopilot_begin(uuid) from public,anon,authenticated;
grant execute on function finance_autopilot_begin(uuid) to service_role;
commit;
