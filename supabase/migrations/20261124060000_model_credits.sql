begin;
-- A user-entered credit checkpoint, never represented as a provider balance.
-- Settled usage before the checkpoint is excluded; all pending/uncertain calls
-- remain held, including ones already in flight when the balance is refreshed.
create table finance_ai_credits(
 owner_id uuid not null,provider text not null,amount_micros bigint not null check(amount_micros between 0 and 1000000000),
 baseline_micros bigint not null,expires_on date not null,recorded_at timestamptz not null default now(),revision integer not null default 1,
 primary key(owner_id,provider),foreign key(owner_id,provider) references finance_ai_connections(owner_id,provider) on delete cascade
);
alter table finance_ai_credits enable row level security;
revoke all on finance_ai_credits from public,anon,authenticated;
grant all on finance_ai_credits to service_role;

create function finance_ai_credit_used(_owner uuid,_provider text) returns bigint language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(sum(case when c.state='settled' then c.cost_micros when c.state in('reserved','sent','uncertain') then c.reserved_micros else 0 end),0)::bigint
 from finance_ai_charges c join finance_ai_receipt_runs r on r.id=c.run_id where c.owner_id=_owner and r.provider=_provider;
$$;
create function finance_ai_credit_status(_owner uuid,_provider text) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('amountMicros',amount_micros,'remainingMicros',greatest(0,amount_micros-greatest(0,finance_ai_credit_used(owner_id,provider)-baseline_micros)),
 'expiresOn',expires_on,'expired',now()>=(expires_on+1)::timestamp at time zone 'UTC','recordedAt',recorded_at,'revision',revision)
 from finance_ai_credits where owner_id=_owner and provider=_provider;
$$;
revoke all on function finance_ai_credit_used(uuid,text),finance_ai_credit_status(uuid,text) from public,anon,authenticated;

create function finance_set_ai_credit(_provider text,_amount bigint,_expires date,_expected integer) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); actual integer; baseline bigint;begin
 if u is null or _provider not in('openai','anthropic') or _amount is null or _amount not between 0 and 1000000000 or _expires is null or _expires < (now() at time zone 'UTC')::date or _expires > (now() at time zone 'UTC')::date+3660 then raise exception 'Enter a remaining credit balance and valid expiry date';end if;
 perform pg_advisory_xact_lock(hashtextextended('ai:'||u::text,0));
 if not exists(select 1 from finance_ai_connections where owner_id=u and provider=_provider) then raise exception 'Connect this provider first';end if;
 select revision into actual from finance_ai_credits where owner_id=u and provider=_provider;
 if actual is distinct from _expected then raise exception 'Your credit changed. Refresh before saving';end if;
 select coalesce(sum(c.cost_micros),0) into baseline from finance_ai_charges c join finance_ai_receipt_runs r on r.id=c.run_id where c.owner_id=u and r.provider=_provider and c.state='settled';
 insert into finance_ai_credits(owner_id,provider,amount_micros,baseline_micros,expires_on) values(u,_provider,_amount,baseline,_expires)
 on conflict(owner_id,provider) do update set amount_micros=excluded.amount_micros,baseline_micros=excluded.baseline_micros,expires_on=excluded.expires_on,recorded_at=now(),revision=finance_ai_credits.revision+1;
end;$$;
create function finance_clear_ai_credit(_provider text,_expected integer) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid();begin
 if u is null then raise exception 'Sign in first';end if;
 perform pg_advisory_xact_lock(hashtextextended('ai:'||u::text,0));
 delete from finance_ai_credits where owner_id=u and provider=_provider and revision=_expected;
 if not found then raise exception 'Your credit changed. Refresh before saving';end if;
end;$$;
revoke all on function finance_set_ai_credit(text,bigint,date,integer),finance_clear_ai_credit(text,integer) from public,anon,authenticated;
grant execute on function finance_set_ai_credit(text,bigint,date,integer),finance_clear_ai_credit(text,integer) to authenticated;

-- Selection is serialized with reservations. Let a live call finish before
-- switching. A prepared but entirely unsent task can be superseded safely;
-- a task with any metered work must finish recovery first, never be re-billed.
create function finance_ai_prepare_switch(_owner uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from finance_autopilot_settings where owner_id=_owner and lease_until>clock_timestamp())
 or exists(select 1 from finance_ai_receipt_runs where owner_id=_owner and status='running' and started_at>now()-interval '10 minutes') then raise exception 'Your current task is still running. Try switching again after it finishes';end if;
 if exists(select 1 from finance_autopilot_work w where w.owner_id=_owner and w.status='running' and exists(select 1 from finance_ai_charges c where c.owner_id=_owner and c.started_at>=w.created_at and c.state<>'released')) then raise exception 'Your current task needs its saved result recovered before switching models';end if;
 update finance_autopilot_work set status='skipped',summary='Model changed before any paid call was sent. Upcoming work uses the selected model.',result='{"modelSwitchedBeforeSend":true}',updated_at=now() where owner_id=_owner and status='running';
end;$$;
create function finance_ai_follow_selection(_owner uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c finance_ai_connections;begin
 select fc.* into c from finance_ai_connections fc join finance_ai_settings s on s.owner_id=fc.owner_id and s.active_provider=fc.provider where fc.owner_id=_owner;
 update finance_autopilot_settings set provider=c.provider,model=c.model,revision=revision+1,
 status=case when enabled then 'ready' else status end,
 next_run_at=case when enabled then now() else next_run_at end,
 summary=case when enabled then 'Selected model saved. Upcoming work continues within your existing limits.' else summary end,updated_at=now()
 where owner_id=_owner;
end;$$;
revoke all on function finance_ai_prepare_switch(uuid),finance_ai_follow_selection(uuid) from public,anon,authenticated;

create or replace function finance_ai_choose(_owner uuid,_provider text,_disconnect boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if _provider not in('openai','anthropic') or _owner is null or _disconnect is null then raise exception 'Invalid provider';end if;
 perform pg_advisory_xact_lock(hashtextextended('ai:'||_owner::text,0));
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

revoke all on function finance_ai_choose(uuid,text,boolean) from public,anon,authenticated;
grant execute on function finance_ai_choose(uuid,text,boolean) to service_role;

-- The edge function verifies model access with the saved key. SQL separately
-- requires current pricing and a matching revision, preserving every other setting.
create function finance_ai_set_model(_owner uuid,_provider text,_model text,_expected integer) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if _owner is null or _provider not in('openai','anthropic') or _model is null or _expected is null then raise exception 'Choose a model';end if;
 perform pg_advisory_xact_lock(hashtextextended('ai:'||_owner::text,0));
 if not exists(select 1 from finance_ai_prices where provider=_provider and model=_model and valid_until>clock_timestamp()) then raise exception 'Your model needs verified pricing before use';end if;
 if exists(select 1 from finance_ai_settings where owner_id=_owner and active_provider=_provider) then perform finance_ai_prepare_switch(_owner);end if;
 update finance_ai_connections set model=_model,revision=revision+1,updated_at=now() where owner_id=_owner and provider=_provider and revision=_expected;
 if not found then raise exception 'Your connection changed. Refresh before saving';end if;
 if exists(select 1 from finance_ai_settings where owner_id=_owner and active_provider=_provider) then perform finance_ai_follow_selection(_owner);end if;
end;$$;
revoke all on function finance_ai_set_model(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function finance_ai_set_model(uuid,text,text,integer) to service_role;

create or replace function finance_ai_status() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('active',(select active_provider from finance_ai_settings where owner_id=auth.uid()),'connections',coalesce((select jsonb_agg(jsonb_build_object('provider',c.provider,'model',c.model,'suffix',c.key_suffix,'requestLimit',c.request_limit,'requestLimitEnabled',c.request_limit_enabled,'revision',c.revision,'credit',finance_ai_credit_status(c.owner_id,c.provider),'pricingReady',exists(select 1 from finance_ai_prices p where p.provider=c.provider and p.model=c.model and p.valid_until>now()),'used',(select count(*) from finance_ai_receipt_runs r where r.owner_id=c.owner_id and r.started_at>now()-interval '24 hours')) order by c.provider) from finance_ai_connections c where c.owner_id=auth.uid()),'[]'::jsonb));
$$;

-- Reservation and scheduler definitions follow below.

create or replace function finance_ai_reserve(_owner uuid,_request uuid,_hash text,_cache text,_bytes integer,_output integer,_research boolean,_provider text,_model text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior finance_ai_receipt_runs;c finance_ai_connections;p finance_ai_prices;b finance_ai_budgets;spent jsonb;reserve bigint;run uuid;tokens bigint;credit jsonb;begin
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
 reserve:=ceil(tokens*p.input_rate+_output*p.output_rate*case when _research then 3 else 1 end+case when _research then 2*p.search_rate else 0 end);
 credit:=finance_ai_credit_status(_owner,c.provider);
 if credit is not null then
  if (credit->>'expired')::boolean then raise exception 'Your AI credit has expired. Update Models & credits or switch providers';end if;
  if (credit->>'remainingMicros')::bigint<reserve then raise exception 'Your AI credit cannot cover the next task (maximum cost $%).',to_char(reserve/1000000.0,'FM9999990.000000');end if;
 end if;
 spent:=finance_ai_spending(_owner);
 if (spent->>'day')::bigint+reserve>b.daily_micros or (spent->>'month')::bigint+reserve>b.monthly_micros then raise exception 'Your AI dollar budget cannot cover the next task (maximum cost $%).',to_char(reserve/1000000.0,'FM9999990.000000');end if;
 if c.request_limit_enabled and (select count(*) from finance_ai_receipt_runs where owner_id=_owner and started_at>now()-interval '24 hours')>=c.request_limit then raise exception 'Your request limit for the last 24 hours has been reached';end if;
 if exists(select 1 from finance_ai_receipt_runs where owner_id=_owner and status='running' and started_at>now()-interval '10 minutes') then raise exception 'An analysis is already running. Wait before starting another';end if;
 insert into finance_ai_receipt_runs(owner_id,request_id,input_hash,cache_hash,provider,model) values(_owner,_request,_hash,_cache,c.provider,c.model) returning id into run;
 insert into finance_ai_charges(run_id,owner_id,reserved_micros,rates,stage) values(run,_owner,reserve,to_jsonb(p),case when _research then 'research' else 'analysis' end);
 return jsonb_build_object('id',run,'status','new','provider',c.provider,'model',c.model,'credential',c.credential,'reservedMicros',reserve);
end;$$;
create or replace function finance_ai_next_window(_owner uuid, _required bigint) returns timestamptz
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  cap integer; cap_enabled boolean; credit jsonb; active text;
  due timestamptz := now();
  slot timestamptz;
  budget finance_ai_budgets;
  spent jsonb;
begin
  select c.request_limit,c.request_limit_enabled into cap,cap_enabled from finance_ai_connections c
    join finance_ai_settings s on s.owner_id=c.owner_id and s.active_provider=c.provider
    where c.owner_id=_owner;
  select active_provider into active from finance_ai_settings where owner_id=_owner;
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

-- Waking from a credit pause never starts a second in-flight call, changes
-- financial permissions, resets the budget, or retries a failed paid request.
create function finance_ai_credit_window_changed() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid;begin
 u:=case when tg_op='DELETE' then old.owner_id else new.owner_id end;
 update finance_autopilot_settings set next_run_at=finance_ai_next_window(u,limit_required_micros),updated_at=clock_timestamp()
 where owner_id=u and enabled and background_enabled and status='limit' and lease is null and failure_count<3
 and (workflow_scope='all_enabled' or not exists(select 1 from finance_autopilot_work w where w.owner_id=u and w.status='failed'));
 return case when tg_op='DELETE' then old else new end;
end;$$;
revoke all on function finance_ai_credit_window_changed() from public,anon,authenticated;
create trigger finance_credit_window_changed after insert or update or delete on finance_ai_credits for each row execute function finance_ai_credit_window_changed();
create trigger finance_active_model_window_changed after insert or update on finance_ai_settings for each row execute function finance_ai_credit_window_changed();
create trigger finance_model_window_changed after update of model on finance_ai_connections for each row execute function finance_ai_credit_window_changed();
commit;
