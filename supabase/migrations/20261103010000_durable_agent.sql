begin;
create table finance_ai_prices(
 provider text not null,model text not null,input_rate numeric not null,output_rate numeric not null,cached_rate numeric not null,write_rate numeric not null,
 context_tokens integer not null,search_rate integer not null default 10000,search_block integer not null default 0,
 verified_at timestamptz not null default now(),valid_until timestamptz not null default now()+interval '30 days',source text not null,
 primary key(provider,model)
);
-- Standard global first-party pricing, verified 2026-11-03. No guessed alias rates.
insert into finance_ai_prices(provider,model,input_rate,output_rate,cached_rate,write_rate,context_tokens,search_block,source) values
 ('anthropic','claude-sonnet-5-5',2,10,.1,4,1000000,0,'https://platform.claude.com/docs/en/about-claude/pricing'),
 ('anthropic','claude-sonnet-4-6',3,15,.3,6,1000000,0,'https://platform.claude.com/docs/en/about-claude/pricing'),
 ('anthropic','claude-sonnet-4-5-20250929',3,15,.3,6,200000,0,'https://platform.claude.com/docs/en/about-claude/pricing'),
 ('anthropic','claude-haiku-4-5-20251001',1,5,.1,2,200000,0,'https://platform.claude.com/docs/en/about-claude/pricing'),
 ('openai','gpt-4.1-mini',.4,1.6,.1,.4,1047576,8000,'https://developers.openai.com/api/docs/models/gpt-4.1-mini'),
 ('openai','gpt-4.1-mini-2025-04-14',.4,1.6,.1,.4,1047576,8000,'https://developers.openai.com/api/docs/models/gpt-4.1-mini'),
 ('openai','gpt-4o-mini',.15,.6,.075,.15,128000,8000,'https://developers.openai.com/api/docs/models/gpt-4o-mini'),
 ('openai','gpt-4o-mini-2024-07-18',.15,.6,.075,.15,128000,8000,'https://developers.openai.com/api/docs/models/gpt-4o-mini');
create table finance_ai_budgets(owner_id uuid primary key references auth.users(id),daily_micros bigint not null default 1000000 check(daily_micros between 0 and 1000000000),monthly_micros bigint not null default 5000000 check(monthly_micros between 0 and 1000000000),revision integer not null default 1,tracking_since timestamptz not null default now(),updated_at timestamptz not null default now(),check(daily_micros<=monthly_micros));
insert into finance_ai_budgets(owner_id) select owner_id from finance_ai_settings;
create table finance_ai_budget_history(id uuid primary key default gen_random_uuid(),owner_id uuid not null,old_value jsonb,new_value jsonb,recorded_at timestamptz not null default now());
create table finance_ai_charges(
 run_id uuid primary key references finance_ai_receipt_runs(id),owner_id uuid not null references auth.users(id),
 reserved_micros bigint not null check(reserved_micros>0),cost_micros bigint check(cost_micros>=0),
 state text not null default 'reserved' check(state in('reserved','sent','settled','uncertain','released')),
 rates jsonb not null,usage jsonb,stage text not null,started_at timestamptz not null default now(),settled_at timestamptz,
 provider_request_id text,reason text
);
create index ai_cost_owner on finance_ai_charges(owner_id,started_at);
alter table finance_ai_receipt_runs add column cache_hash text;
alter table finance_ai_budgets enable row level security;alter table finance_ai_budget_history enable row level security;alter table finance_ai_charges enable row level security;alter table finance_ai_prices enable row level security;
revoke all on finance_ai_budgets,finance_ai_budget_history,finance_ai_charges,finance_ai_prices from public,anon,authenticated;
grant all on finance_ai_budgets,finance_ai_budget_history,finance_ai_charges,finance_ai_prices to service_role;
grant select on finance_ai_budgets,finance_ai_budget_history to authenticated;
create policy ai_budget_own on finance_ai_budgets for select to authenticated using(owner_id=auth.uid());
create policy ai_budget_history_own on finance_ai_budget_history for select to authenticated using(owner_id=auth.uid());
create function finance_ai_spending(_owner uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('day',coalesce(sum(case when state='settled' and settled_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC' then cost_micros when state in('reserved','sent','uncertain') then reserved_micros else 0 end),0),
 'month',coalesce(sum(case when state='settled' and settled_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC' then cost_micros when state in('reserved','sent','uncertain') then reserved_micros else 0 end),0),
 'held',coalesce(sum(case when state in('reserved','sent','uncertain') then reserved_micros else 0 end),0),'uncertain',count(*) filter(where state='uncertain')) from finance_ai_charges where owner_id=_owner;
$$;
create function finance_ai_cost_status() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('budget',coalesce((select to_jsonb(b)-'owner_id' from finance_ai_budgets b where owner_id=auth.uid()),jsonb_build_object('daily_micros',1000000,'monthly_micros',5000000,'revision',0,'tracking_since',null)),
 'usage',finance_ai_spending(auth.uid()),'pricingReady',exists(select 1 from finance_ai_connections c join finance_ai_settings s on s.owner_id=c.owner_id and s.active_provider=c.provider join finance_ai_prices p on p.provider=c.provider and p.model=c.model where c.owner_id=auth.uid() and p.valid_until>now()),
 'recent',coalesce((select jsonb_agg(x) from (select c.run_id,c.state,c.reserved_micros,c.cost_micros,c.stage,c.started_at,c.reason,r.provider,r.model from finance_ai_charges c join finance_ai_receipt_runs r on r.id=c.run_id where c.owner_id=auth.uid() order by c.started_at desc limit 20)x),'[]'::jsonb));
$$;
create function finance_set_ai_budget(_daily bigint,_monthly bigint,_expected integer) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid();b finance_ai_budgets;begin
 if u is null or _daily is null or _monthly is null or _expected is null or _daily<0 or _daily>_monthly or _monthly>1000000000 then raise exception 'Choose valid daily and monthly dollar limits';end if;
 perform pg_advisory_xact_lock(hashtextextended('ai:'||u::text,0));select * into b from finance_ai_budgets where owner_id=u for update;
 if coalesce(b.revision,0)<>_expected then raise exception 'Your budget changed. Refresh first';end if;
 insert into finance_ai_budgets(owner_id,daily_micros,monthly_micros) values(u,_daily,_monthly) on conflict(owner_id) do update set daily_micros=_daily,monthly_micros=_monthly,revision=finance_ai_budgets.revision+1,updated_at=now();
 insert into finance_ai_budget_history(owner_id,old_value,new_value) values(u,to_jsonb(b),(select to_jsonb(v) from finance_ai_budgets v where owner_id=u));
end;$$;
-- The count allowance is shared across providers, as are dollar budgets.
create or replace function finance_ai_status() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('active',(select active_provider from finance_ai_settings where owner_id=auth.uid()),'connections',coalesce((select jsonb_agg(jsonb_build_object('provider',c.provider,'model',c.model,'suffix',c.key_suffix,'requestLimit',c.request_limit,'revision',c.revision,'updatedAt',c.updated_at,'used',(select count(*) from finance_ai_receipt_runs r where r.owner_id=c.owner_id and r.started_at>now()-interval '24 hours'))) from finance_ai_connections c where c.owner_id=auth.uid()),'[]'::jsonb));
$$;
-- The legacy entry point cannot bypass dollar reservations during rolling deploys.
create or replace function finance_ai_reserve(_owner uuid,_request uuid,_hash text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$begin raise exception 'Your AI service is updating its cost controls. Try again shortly';end;$$;
create function finance_ai_reserve(_owner uuid,_request uuid,_hash text,_cache text,_bytes integer,_output integer,_research boolean,_provider text,_model text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
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
 if (spent->>'day')::bigint+reserve>b.daily_micros or (spent->>'month')::bigint+reserve>b.monthly_micros then raise exception 'Your AI dollar budget cannot cover the next task. Saved progress is safe';end if;
 if (select count(*) from finance_ai_receipt_runs where owner_id=_owner and started_at>now()-interval '24 hours')>=c.request_limit then raise exception 'Your request limit for the last 24 hours has been reached';end if;
 if exists(select 1 from finance_ai_receipt_runs where owner_id=_owner and status='running' and started_at>now()-interval '10 minutes') then raise exception 'An analysis is already running. Wait before starting another';end if;
 insert into finance_ai_receipt_runs(owner_id,request_id,input_hash,cache_hash,provider,model) values(_owner,_request,_hash,_cache,c.provider,c.model) returning id into run;
 insert into finance_ai_charges(run_id,owner_id,reserved_micros,rates,stage) values(run,_owner,reserve,to_jsonb(p),case when _research then 'research' else 'analysis' end);
 return jsonb_build_object('id',run,'status','new','provider',c.provider,'model',c.model,'credential',c.credential,'reservedMicros',reserve);
end;$$;
create function finance_ai_mark_sent(_owner uuid,_run uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 perform pg_advisory_xact_lock(hashtextextended('ai:'||_owner::text,0));
 update finance_ai_charges set state='sent' where owner_id=_owner and run_id=_run and state='reserved' and started_at>clock_timestamp()-interval '10 minutes';
 if not found then raise exception 'This paid attempt is no longer available. Check saved work';end if;
end;$$;
create function finance_ai_settle(_owner uuid,_run uuid,_usage jsonb,_provider_id text default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c finance_ai_charges;r jsonb;cost bigint;k text;begin
 perform pg_advisory_xact_lock(hashtextextended('ai:'||_owner::text,0));select * into c from finance_ai_charges where owner_id=_owner and run_id=_run for update;
 if not found then raise exception 'Your cost reservation is missing';end if;if c.state='settled' then return;end if;
 if _usage is null then update finance_ai_charges set state=case when state='reserved' then 'released' else 'uncertain' end,reason=case when state='reserved' then 'Stopped before sending' else 'Provider usage unavailable; maximum cost remains held' end where run_id=_run;return;end if;
 foreach k in array array['input','cached','cacheWrite','output','searches'] loop
  if not(_usage ? k) or (_usage->>k)!~'^[0-9]+$' or (_usage->>k)::numeric>10000000 then raise exception 'Provider usage is invalid';end if;
 end loop;
 r:=c.rates;cost:=ceil((_usage->>'input')::bigint*(r->>'input_rate')::numeric+(_usage->>'cached')::bigint*(r->>'cached_rate')::numeric+(_usage->>'cacheWrite')::bigint*(r->>'write_rate')::numeric+(_usage->>'output')::bigint*(r->>'output_rate')::numeric+(_usage->>'searches')::bigint*((r->>'search_rate')::numeric+(r->>'search_block')::numeric*(r->>'input_rate')::numeric));
 update finance_ai_charges set cost_micros=cost,usage=_usage,state='settled',settled_at=clock_timestamp(),provider_request_id=left(_provider_id,200),reason=case when cost>reserved_micros then 'Usage exceeded reservation; pricing requires review' else null end where run_id=_run;
 if cost>c.reserved_micros then update finance_ai_prices set valid_until=now() where provider=r->>'provider' and model=r->>'model';end if;
end;$$;
create function finance_ai_reap() returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 update finance_ai_charges set state=case when state='reserved' then 'released' else 'uncertain' end,reason='Worker stopped; no automatic paid retry' where state in('reserved','sent') and started_at<now()-interval '10 minutes';
 update finance_ai_receipt_runs set status='failed',finished_at=now() where status='running' and started_at<now()-interval '10 minutes';
end;$$;
alter table finance_autopilot_settings add column background_enabled boolean not null default false;
alter table finance_autopilot_settings add column next_run_at timestamptz not null default now();
alter table finance_autopilot_settings add column last_started_at timestamptz;
alter table finance_autopilot_settings add column last_finished_at timestamptz;
alter table finance_autopilot_settings add column failure_count integer not null default 0;
grant select(background_enabled,next_run_at,last_started_at,last_finished_at,failure_count) on finance_autopilot_settings to authenticated;
alter table finance_autopilot_work add column attempts integer not null default 0;
create function finance_background_autopilot(_enabled boolean,_expected integer) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 perform finance_configure_autopilot(_enabled,_expected);
 update finance_autopilot_settings set background_enabled=_enabled,next_run_at=now(),failure_count=0,summary=case when _enabled then 'Background work is ready. It continues when you close Millie.' else 'Paused. A task already sent may finish.' end where owner_id=auth.uid();
end;$$;
create or replace function finance_autopilot_begin(_owner uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s finance_autopilot_settings;l uuid:=gen_random_uuid();begin
 select * into s from finance_autopilot_settings where owner_id=_owner for update;
 if not found or not s.enabled then return jsonb_build_object('paused',true);end if;
 if s.lease_until>clock_timestamp() then return jsonb_build_object('busy',true);end if;
 update finance_autopilot_settings set lease=l,lease_until=clock_timestamp()+interval '5 minutes',status='working',last_started_at=clock_timestamp(),updated_at=clock_timestamp() where owner_id=_owner;
 return jsonb_build_object('lease',l,'provider',s.provider,'model',s.model,'revision',s.revision);
end;$$;
create or replace function finance_autopilot_end(_owner uuid,_lease uuid,_status text,_summary text,_attention jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 if _status not in('working','idle','needs_input','limit','error','paused') or jsonb_typeof(_attention)<>'array' or jsonb_array_length(_attention)>30 then raise exception 'Invalid automatic work status';end if;
 update finance_autopilot_settings set lease=null,lease_until=null,status=case when enabled then _status else 'paused' end,summary=left(_summary,1800),attention=_attention,last_finished_at=clock_timestamp(),updated_at=clock_timestamp(),failure_count=case when _status='error' then failure_count+1 else 0 end,
 next_run_at=clock_timestamp()+case when _status='working' then interval '1 minute' when _status='error' then interval '15 minutes' when _status='limit' then interval '1 hour' else interval '15 minutes' end where owner_id=_owner and lease=_lease;
end;$$;
create function finance_worker_valid(_owner uuid,_lease uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from finance_autopilot_settings where owner_id=_owner and enabled and background_enabled and lease=_lease and lease_until>clock_timestamp());$$;
create view finance_worker_offsets as select o.*,t.user_id owner_id from transaction_offsets o join transactions t on t.id=o.parent_transaction_id;
revoke all on finance_worker_offsets from public,anon,authenticated;grant select on finance_worker_offsets to service_role;
grant select on finance_module_preferences to service_role;
create function finance_worker_command(_owner uuid,_lease uuid,_command text,_args jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;begin
 if not finance_worker_valid(_owner,_lease) then raise exception 'Automatic work was paused or its lease expired';end if;
 perform set_config('request.jwt.claim.sub',_owner::text,true);
 if _command='finance_ai_status' then return finance_ai_status();
 elsif _command='finance_ai_apply_receipts' then return finance_ai_apply_receipts(_args->'_purchases');
 elsif _command='finance_assistant_apply' then return finance_assistant_apply((_args->>'_id')::uuid,(_args->>'_expected')::integer,true);
 elsif _command='finance_assistant_update' and _args->>'_action'='done' then return finance_assistant_update((_args->>'_id')::uuid,(_args->>'_expected')::integer,'done','{}');
 else raise exception 'Automatic work command is not allowed';end if;
end;$$;
create function finance_dispatch_autopilot() returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare token text;s record;n integer:=0;begin
 perform finance_ai_reap();select decrypted_secret into strict token from vault.decrypted_secrets where name='millie_scheduler_token';
 for s in select * from finance_autopilot_settings where enabled and background_enabled and next_run_at<=now() and coalesce(lease_until,'-infinity')<now() and not exists(select 1 from finance_autopilot_work w where w.owner_id=finance_autopilot_settings.owner_id and w.status='failed') and failure_count<3 order by next_run_at limit 5 for update skip locked loop
  perform net.http_post(url:='https://cdkqtoghirbegixbgfli.supabase.co/functions/v1/finance-autopilot',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body:=jsonb_build_object('action','step','workerOwner',s.owner_id),timeout_milliseconds:=180000);
  update finance_autopilot_settings set next_run_at=now()+interval '5 minutes' where owner_id=s.owner_id;n:=n+1;
 end loop;return n;
end;$$;
revoke all on function finance_ai_spending(uuid),finance_ai_cost_status(),finance_set_ai_budget(bigint,bigint,integer),finance_ai_reserve(uuid,uuid,text,text,integer,integer,boolean,text,text),finance_ai_mark_sent(uuid,uuid),finance_ai_settle(uuid,uuid,jsonb,text),finance_ai_reap(),finance_background_autopilot(boolean,integer),finance_worker_valid(uuid,uuid),finance_worker_command(uuid,uuid,text,jsonb),finance_dispatch_autopilot() from public,anon,authenticated;
grant execute on function finance_ai_cost_status(),finance_set_ai_budget(bigint,bigint,integer),finance_background_autopilot(boolean,integer) to authenticated;
grant execute on function finance_ai_spending(uuid),finance_ai_reserve(uuid,uuid,text,text,integer,integer,boolean,text,text),finance_ai_mark_sent(uuid,uuid),finance_ai_settle(uuid,uuid,jsonb,text),finance_ai_reap(),finance_worker_valid(uuid,uuid),finance_worker_command(uuid,uuid,text,jsonb),finance_dispatch_autopilot() to service_role;
-- Activation is a separate final deployment step, after all workers are updated.
commit;
