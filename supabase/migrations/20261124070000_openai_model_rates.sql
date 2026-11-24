begin;
-- Verified 2026-11-24 against the exact official model page. Short-context
-- standard pricing; long-context reservations and settlement use the documented
-- 2x input/cache and 1.5x output multipliers above 272K input tokens.
insert into finance_ai_prices(provider,model,input_rate,output_rate,cached_rate,write_rate,context_tokens,search_block,source,verified_at,valid_until)
values('openai','gpt-6.1-sol',2,10,.1,2.5,1050000,0,'https://developers.openai.com/api/docs/models/gpt-6.1-sol',now(),now()+interval '14 days')
on conflict(provider,model) do update set input_rate=excluded.input_rate,output_rate=excluded.output_rate,cached_rate=excluded.cached_rate,write_rate=excluded.write_rate,context_tokens=excluded.context_tokens,search_block=excluded.search_block,source=excluded.source,verified_at=excluded.verified_at,valid_until=excluded.valid_until;

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
create or replace function finance_ai_settle(_owner uuid,_run uuid,_usage jsonb,_provider_id text default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c finance_ai_charges;r jsonb;cost bigint;k text;begin
 perform pg_advisory_xact_lock(hashtextextended('ai:'||_owner::text,0));select * into c from finance_ai_charges where owner_id=_owner and run_id=_run for update;
 if not found then raise exception 'Your cost reservation is missing';end if;if c.state='settled' then return;end if;
 if _usage is null then update finance_ai_charges set state=case when state='reserved' then 'released' else 'uncertain' end,reason=case when state='reserved' then 'Stopped before sending' else 'Provider usage unavailable; maximum cost remains held' end where run_id=_run;return;end if;
 foreach k in array array['input','cached','cacheWrite','output','searches'] loop
  if not(_usage ? k) or (_usage->>k)!~'^[0-9]+$' or (_usage->>k)::numeric>10000000 then raise exception 'Provider usage is invalid';end if;
 end loop;
 r:=c.rates;
 if r ? 'long_context_threshold' and (_usage->>'input')::bigint+(_usage->>'cached')::bigint+(_usage->>'cacheWrite')::bigint > (r->>'long_context_threshold')::bigint then
  r:=r||jsonb_build_object('input_rate',(r->>'input_rate')::numeric*(r->>'long_input_multiplier')::numeric,'cached_rate',(r->>'cached_rate')::numeric*(r->>'long_input_multiplier')::numeric,'write_rate',(r->>'write_rate')::numeric*(r->>'long_input_multiplier')::numeric,'output_rate',(r->>'output_rate')::numeric*(r->>'long_output_multiplier')::numeric);
 end if;
 cost:=ceil((_usage->>'input')::bigint*(r->>'input_rate')::numeric+(_usage->>'cached')::bigint*(r->>'cached_rate')::numeric+(_usage->>'cacheWrite')::bigint*(r->>'write_rate')::numeric+(_usage->>'output')::bigint*(r->>'output_rate')::numeric+(_usage->>'searches')::bigint*((r->>'search_rate')::numeric+(r->>'search_block')::numeric*(r->>'input_rate')::numeric));
 update finance_ai_charges set cost_micros=cost,usage=_usage,state='settled',settled_at=clock_timestamp(),provider_request_id=left(_provider_id,200),reason=case when cost>reserved_micros then 'Usage exceeded reservation; pricing requires review' else null end where run_id=_run;
 if cost>c.reserved_micros then update finance_ai_prices set valid_until=now() where provider=r->>'provider' and model=r->>'model';end if;
end;$$;
commit;
