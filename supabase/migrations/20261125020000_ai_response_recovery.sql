begin;
-- Private encrypted checkpoints permit local revalidation without another paid call.
alter table finance_ai_receipt_runs add column response_cipher text,add column failure_message text;
create or replace function finance_ai_reserve(_owner uuid,_request uuid,_hash text,_cache text,_bytes integer,_output integer,_research boolean,_provider text,_model text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior finance_ai_receipt_runs;c finance_ai_connections;p finance_ai_prices;b finance_ai_budgets;spent jsonb;reserve bigint;run uuid;tokens bigint;credit jsonb;long_priced boolean;rates jsonb;begin
 if _owner is null or _request is null or _hash is null or _cache is null or _hash!~'^[a-f0-9]{64}$' or _cache!~'^[a-f0-9]{64}$' or _bytes is null or _bytes not between 1 and 180000 or _output is null or _output not between 1 and 6000 or _research is null then raise exception 'Invalid cost reservation';end if;
 perform pg_advisory_xact_lock(hashtextextended('ai:'||_owner::text,0));
 select * into prior from finance_ai_receipt_runs where owner_id=_owner and request_id=_request;
 if found then
  if prior.input_hash<>_hash then raise exception 'Request ID already used';end if;
  return jsonb_build_object('id',prior.id,'status',prior.status,'result',prior.result,'provider',prior.provider,'model',prior.model,'responseCipher',prior.response_cipher);
 end if;
 select fc.* into c from finance_ai_connections fc join finance_ai_settings s on s.owner_id=fc.owner_id and s.active_provider=fc.provider where fc.owner_id=_owner;
 if not found then raise exception 'Connect and select an AI provider in Customize Millie';end if;
 if c.provider is distinct from _provider or c.model is distinct from _model then raise exception 'Your provider changed. No data was sent';end if;
 select * into prior from finance_ai_receipt_runs where owner_id=_owner and provider=c.provider and model=c.model and (cache_hash=_cache or input_hash=_hash) and status='succeeded' and started_at>now()-interval '30 days' order by started_at desc limit 1;
 if found then return jsonb_build_object('id',prior.id,'status',prior.status,'result',prior.result,'provider',prior.provider,'model',prior.model,'responseCipher',prior.response_cipher);end if;
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

-- Associate recovery with the exact analysis and research requests. An older
-- unrelated charge must not pin every later task to its provider.
create function finance_ai_work_metered(_owner uuid,_request uuid,_since timestamptz) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 with hash as (select encode(sha256(convert_to('["'||_request::text||'","research"]','UTF8')),'hex') h), research as
 (select (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-8'||substr(h,18,3)||'-'||substr(h,21,12))::uuid id from hash)
 select exists(select 1 from finance_ai_charges c join finance_ai_receipt_runs r on r.id=c.run_id
 where c.owner_id=_owner and c.state<>'released' and case when _request is null then c.started_at>=_since else r.request_id=_request or r.request_id=(select id from research) end);
$$;
revoke all on function finance_ai_work_metered(uuid,uuid,timestamptz) from public,anon,authenticated;

create or replace function finance_ai_prepare_switch(_owner uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from finance_autopilot_settings where owner_id=_owner and lease_until>clock_timestamp())
 or exists(select 1 from finance_ai_receipt_runs where owner_id=_owner and status='running' and started_at>now()-interval '10 minutes') then raise exception 'Your current task is still running. Try switching again after it finishes';end if;
 if exists(select 1 from finance_autopilot_work w where w.owner_id=_owner and w.status='running' and finance_ai_work_metered(w.owner_id,w.request_id,w.created_at)) then raise exception 'Your current task needs its saved result recovered before switching models';end if;
 update finance_autopilot_work set status='skipped',summary='Model changed before any paid call was sent. Upcoming work uses the selected model.',result='{"modelSwitchedBeforeSend":true}',updated_at=now() where owner_id=_owner and status='running';
end;$$;
create or replace function finance_ai_advance_credit(_owner uuid,_lease uuid,_required bigint) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare s finance_autopilot_settings;begin
 if _owner is null or _lease is null or _required is null or _required<0 then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended('ai:'||_owner::text,0));
 select * into s from finance_autopilot_settings where owner_id=_owner and lease=_lease and lease_until>clock_timestamp() for update;
 if not found or not s.enabled or not exists(select 1 from finance_ai_settings where owner_id=_owner and credits_first) then return false;end if;
 if exists(select 1 from finance_ai_receipt_runs where owner_id=_owner and status='running' and started_at>now()-interval '10 minutes') then return false;end if;
 if exists(select 1 from finance_autopilot_work w where w.owner_id=_owner and w.status='running' and finance_ai_work_metered(w.owner_id,w.request_id,w.created_at)) then return false;end if;
 update finance_ai_credits set blocked_required_micros=greatest(blocked_required_micros,_required,1) where owner_id=_owner and provider=s.provider;
 update finance_autopilot_work set status='skipped',summary='Credit could not cover this task. No paid request was sent; upcoming work can use the next credit.',result='{"modelSwitchedBeforeSend":true}',updated_at=now() where owner_id=_owner and status='running';
 update finance_autopilot_settings set lease=null,lease_until=null,status='ready',next_run_at=now(),last_finished_at=clock_timestamp(),updated_at=clock_timestamp(),summary='Checking the next available credit before another paid task.' where owner_id=_owner;
 return true;
end;$$;
create or replace function finance_autopilot_begin(_owner uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s finance_autopilot_settings;c finance_ai_connections;chosen text;l uuid:=gen_random_uuid();begin
 perform pg_advisory_xact_lock(hashtextextended('ai:'||_owner::text,0));
 select * into s from finance_autopilot_settings where owner_id=_owner for update;
 if not found or not s.enabled then return jsonb_build_object('paused',true);end if;
 if s.lease_until>clock_timestamp() or exists(select 1 from finance_ai_receipt_runs where owner_id=_owner and status='running' and started_at>now()-interval '10 minutes') then return jsonb_build_object('busy',true);end if;
 if exists(select 1 from finance_ai_settings where owner_id=_owner and credits_first)
 and not exists(select 1 from finance_autopilot_work w where w.owner_id=_owner and w.status='running' and finance_ai_work_metered(w.owner_id,w.request_id,w.created_at)) then
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
commit;
