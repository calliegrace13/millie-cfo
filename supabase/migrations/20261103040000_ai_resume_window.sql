begin;

alter table finance_autopilot_settings add column limit_required_micros bigint not null default 0 check(limit_required_micros >= 0);

-- Use the same owner-wide request log, UTC boundaries and outstanding holds as the reservation.
create function finance_ai_next_window(_owner uuid, _required bigint) returns timestamptz
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  cap integer;
  due timestamptz := now();
  slot timestamptz;
  budget finance_ai_budgets;
  spent jsonb;
begin
  select c.request_limit into cap from finance_ai_connections c
    join finance_ai_settings s on s.owner_id=c.owner_id and s.active_provider=c.provider
    where c.owner_id=_owner;
  if cap is null or cap < 1 then return 'infinity'; end if;
  select started_at + interval '24 hours' into slot from finance_ai_receipt_runs
    where owner_id=_owner and started_at > now()-interval '24 hours'
    order by started_at desc offset (cap-1) limit 1;
  due := greatest(due,slot);
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

create function finance_autopilot_wait(_owner uuid,_lease uuid,_required bigint,_attention jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare due timestamptz;
begin
  if _required is null or _required<0 or jsonb_typeof(_attention) is distinct from 'array' or jsonb_array_length(_attention)>30 then raise exception 'Invalid wait request'; end if;
  -- Serialize with budget edits and reservations, then verify the worker still owns the lease.
  perform pg_advisory_xact_lock(hashtextextended('ai:'||_owner::text,0));
  due := finance_ai_next_window(_owner,_required);
  update finance_autopilot_settings set lease=null,lease_until=null,last_finished_at=clock_timestamp(),updated_at=clock_timestamp(),
    attention=_attention,limit_required_micros=_required,failure_count=0,next_run_at=due,
    status=case when enabled then 'limit' else 'paused' end,
    summary=case when not enabled then 'Automatic work is paused.'
      when due='infinity' then 'The next task exceeds the available budget. Millie will check again when you raise a limit or a reserved charge clears.'
      else 'Your work is saved. Millie will resume automatically when your allowance is available.' end
    where owner_id=_owner and lease=_lease;
end;$$;

create function finance_recheck_ai_window() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update finance_autopilot_settings set next_run_at=finance_ai_next_window(new.owner_id,limit_required_micros),updated_at=clock_timestamp()
  where owner_id=new.owner_id and enabled and background_enabled and status='limit' and lease is null and failure_count<3
  and not exists(select 1 from finance_autopilot_work w where w.owner_id=new.owner_id and w.status='failed');
  return new;
end;$$;

create trigger finance_request_window_changed after update of request_limit on finance_ai_connections
for each row when (new.request_limit is distinct from old.request_limit) execute function finance_recheck_ai_window();
create trigger finance_dollar_window_changed after update of daily_micros,monthly_micros on finance_ai_budgets
for each row when (new.daily_micros is distinct from old.daily_micros or new.monthly_micros is distinct from old.monthly_micros) execute function finance_recheck_ai_window();
create trigger finance_charge_hold_cleared after update of state on finance_ai_charges
for each row when (old.state in ('reserved','sent','uncertain') and new.state in ('released','settled')) execute function finance_recheck_ai_window();

revoke all on function finance_ai_next_window(uuid,bigint),finance_autopilot_wait(uuid,uuid,bigint,jsonb),finance_recheck_ai_window() from public,anon,authenticated;
grant execute on function finance_autopilot_wait(uuid,uuid,bigint,jsonb) to service_role;

-- Restore the exact slot for background work already waiting under the older hourly check.
update finance_autopilot_settings set next_run_at=finance_ai_next_window(owner_id,0)
where status='limit' and enabled and background_enabled and lease is null and failure_count<3
and not exists(select 1 from finance_autopilot_work w where w.owner_id=finance_autopilot_settings.owner_id and w.status='failed');

create function finance_set_ai_request_limit(_provider text,_limit integer,_expected integer) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid();
begin
  if u is null or _limit is null or _limit not between 1 and 20 then raise exception 'Choose a request limit from 1 to 20'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ai:'||u::text,0));
  update finance_ai_connections set request_limit=_limit,revision=revision+1,updated_at=now()
    where owner_id=u and provider=_provider and revision=_expected;
  if not found then raise exception 'Your connection changed. Refresh before saving the limit'; end if;
end;$$;
revoke all on function finance_set_ai_request_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function finance_set_ai_request_limit(text,integer,integer) to authenticated;

create or replace function finance_ai_reserve(_owner uuid,_request uuid,_hash text,_cache text,_bytes integer,_output integer,_research boolean,_provider text,_model text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior finance_ai_receipt_runs;c finance_ai_connections;p finance_ai_prices;b finance_ai_budgets;spent jsonb;reserve bigint;run uuid;tokens bigint;begin
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
 spent:=finance_ai_spending(_owner);
 if (spent->>'day')::bigint+reserve>b.daily_micros or (spent->>'month')::bigint+reserve>b.monthly_micros then raise exception 'Your AI dollar budget cannot cover the next task (maximum cost $%).',to_char(reserve/1000000.0,'FM9999990.000000');end if;
 if (select count(*) from finance_ai_receipt_runs where owner_id=_owner and started_at>now()-interval '24 hours')>=c.request_limit then raise exception 'Your request limit for the last 24 hours has been reached';end if;
 if exists(select 1 from finance_ai_receipt_runs where owner_id=_owner and status='running' and started_at>now()-interval '10 minutes') then raise exception 'An analysis is already running. Wait before starting another';end if;
 insert into finance_ai_receipt_runs(owner_id,request_id,input_hash,cache_hash,provider,model) values(_owner,_request,_hash,_cache,c.provider,c.model) returning id into run;
 insert into finance_ai_charges(run_id,owner_id,reserved_micros,rates,stage) values(run,_owner,reserve,to_jsonb(p),case when _research then 'research' else 'analysis' end);
 return jsonb_build_object('id',run,'status','new','provider',c.provider,'model',c.model,'credential',c.credential,'reservedMicros',reserve);
end;$$;

create or replace function finance_autopilot_end(_owner uuid,_lease uuid,_status text,_summary text,_attention jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 if _status not in('working','idle','needs_input','limit','error','paused') or jsonb_typeof(_attention)<>'array' or jsonb_array_length(_attention)>30 then raise exception 'Invalid automatic work status';end if;
 if _status='limit' then perform finance_autopilot_wait(_owner,_lease,0,_attention);return;end if;
 update finance_autopilot_settings set lease=null,lease_until=null,status=case when enabled then _status else 'paused' end,summary=left(_summary,1800),attention=_attention,last_finished_at=clock_timestamp(),updated_at=clock_timestamp(),failure_count=case when _status='error' then failure_count+1 else 0 end,
 next_run_at=clock_timestamp()+case when _status='working' then interval '1 minute' when _status='error' then interval '15 minutes' else interval '15 minutes' end where owner_id=_owner and lease=_lease;
end;$$;
commit;
