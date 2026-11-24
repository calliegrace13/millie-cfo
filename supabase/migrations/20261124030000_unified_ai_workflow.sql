begin;
alter table finance_autopilot_settings add column workflow_scope text not null default 'core' check(workflow_scope in ('core','all_enabled'));
grant select(workflow_scope) on finance_autopilot_settings to authenticated;

-- Invoked only by the explicit Run Millie button. This enables analysis across
-- visible tools, preserving every dollar limit, web/receipt setting, auto-save
-- permission and failed paid request. Hidden tools remain untouched.
create function finance_start_ai_workflow(_expected integer) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid();s finance_autopilot_settings;p finance_ai_policies;c jsonb;cost jsonb;tools text[];module_key text;keys text[];begin
 if u is null then raise exception 'Sign in first';end if;
 if _expected is null then raise exception 'Refresh your workflow first';end if;
 perform pg_advisory_xact_lock(hashtextextended('autopilot:'||u::text,0));
 select * into s from finance_autopilot_settings where owner_id=u for update;
 if coalesce(s.revision,0)<>_expected then raise exception 'Your workflow changed. Refresh first';end if;
 if s.lease_until>clock_timestamp() then raise exception 'A task is running. Wait for its checkpoint before starting a new workflow';end if;
 c:=finance_ai_status();cost:=finance_ai_cost_status();
 if c->>'active' is null then raise exception 'Connect your AI provider first';end if;
 if not coalesce((cost->>'pricingReady')::boolean,false) then raise exception 'Your model needs verified pricing before starting paid work';end if;
 if coalesce((cost->'budget'->>'daily_micros')::bigint,0)=0 or coalesce((cost->'budget'->>'monthly_micros')::bigint,0)=0 then raise exception 'Choose a nonzero AI spending limit before starting';end if;
 select enabled_modules into tools from finance_module_preferences where owner_id=u;
 tools:=array['transactions']||coalesce(tools,array['everyday','runway','goals','analyst','household','close','assets','rewards','income','investments','debt','longterm','watchlists','recoveries']);
 foreach module_key in array tools loop
  keys:=finance_ai_task_keys(module_key);if cardinality(keys)=0 then continue;end if;
  select * into p from finance_ai_policies where owner_id=u and module=module_key;
  if p.mode='ai' and keys<@p.tasks then continue;end if;
  perform finance_set_ai_policy(module_key,'ai',keys,coalesce(p.auto_tasks,'{}'),coalesce(p.use_receipts,false),coalesce(p.use_web,false),coalesce(p.revision,0));
 end loop;
 insert into finance_autopilot_settings(owner_id,enabled,background_enabled,provider,model,revision,status,summary,workflow_scope,next_run_at,failure_count)
 values(u,true,true,c->>'active',(select v->>'model' from jsonb_array_elements(c->'connections') v where v->>'provider'=c->>'active'),coalesce(s.revision,0)+1,'ready','Millie will work through your enabled tools within your existing limits. Failed calls remain for review.','all_enabled',now(),0)
 on conflict(owner_id) do update set enabled=true,background_enabled=true,provider=excluded.provider,model=excluded.model,revision=excluded.revision,status='ready',summary=excluded.summary,workflow_scope='all_enabled',next_run_at=now(),failure_count=0,updated_at=clock_timestamp();
end;$$;
revoke all on function finance_start_ai_workflow(integer) from public,anon,authenticated;
grant execute on function finance_start_ai_workflow(integer) to authenticated;

-- Updated lease and scheduler functions follow. Legacy core workflows retain
-- their failure gate; only a new all-enabled opt-in permits independent work.

create or replace function finance_autopilot_begin(_owner uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s finance_autopilot_settings;l uuid:=gen_random_uuid();begin
 select * into s from finance_autopilot_settings where owner_id=_owner for update;
 if not found or not s.enabled then return jsonb_build_object('paused',true);end if;
 if s.lease_until>clock_timestamp() then return jsonb_build_object('busy',true);end if;
 update finance_autopilot_settings set lease=l,lease_until=clock_timestamp()+interval '5 minutes',status='working',last_started_at=clock_timestamp(),updated_at=clock_timestamp() where owner_id=_owner;
 return jsonb_build_object('lease',l,'provider',s.provider,'model',s.model,'revision',s.revision,'workflow_scope',s.workflow_scope);
end;$$;
create or replace function finance_dispatch_autopilot() returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare token text;s record;n integer:=0;begin
 perform finance_ai_reap();select decrypted_secret into strict token from vault.decrypted_secrets where name='millie_scheduler_token';
 for s in select * from finance_autopilot_settings where enabled and background_enabled and next_run_at<=now() and coalesce(lease_until,'-infinity')<now() and (workflow_scope='all_enabled' or not exists(select 1 from finance_autopilot_work w where w.owner_id=finance_autopilot_settings.owner_id and w.status='failed')) and failure_count<3 order by next_run_at limit 5 for update skip locked loop
  perform net.http_post(url:='https://cdkqtoghirbegixbgfli.supabase.co/functions/v1/finance-autopilot',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body:=jsonb_build_object('action','step','workerOwner',s.owner_id),timeout_milliseconds:=180000);
  update finance_autopilot_settings set next_run_at=now()+interval '5 minutes' where owner_id=s.owner_id;n:=n+1;
 end loop;return n;
end;$$;
commit;
