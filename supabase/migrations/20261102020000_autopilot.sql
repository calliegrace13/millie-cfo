begin;
create table finance_autopilot_settings(owner_id uuid primary key references auth.users(id),enabled boolean not null default false,provider text,model text,revision integer not null default 1,lease uuid,lease_until timestamptz,status text not null default 'paused',summary text not null default '',attention jsonb not null default '[]',updated_at timestamptz not null default now());
create table finance_autopilot_work(id uuid primary key default gen_random_uuid(),request_id uuid not null default gen_random_uuid(),owner_id uuid not null references auth.users(id),fingerprint text not null,kind text not null,payload jsonb not null default '{}',result jsonb not null default '{}',status text not null default 'running' check(status in('running','done','failed','skipped')),summary text not null default '',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner_id,fingerprint));
create index autopilot_owner_work on finance_autopilot_work(owner_id,created_at desc);
alter table finance_autopilot_settings enable row level security;alter table finance_autopilot_work enable row level security;
revoke all on finance_autopilot_settings,finance_autopilot_work from public,anon,authenticated;
grant select(owner_id,enabled,provider,model,revision,status,summary,attention,updated_at) on finance_autopilot_settings to authenticated;
grant select on finance_autopilot_work to authenticated;grant all on finance_autopilot_settings,finance_autopilot_work to service_role;
create policy autopilot_settings_own on finance_autopilot_settings for select to authenticated using(owner_id=auth.uid());
create policy autopilot_work_own on finance_autopilot_work for select to authenticated using(owner_id=auth.uid());
create function finance_configure_autopilot(_enabled boolean,_expected integer) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid();s finance_autopilot_settings;p finance_ai_policies;c jsonb;x text;begin
 if u is null then raise exception 'Sign in first';end if;
 if _enabled is null or _expected is null then raise exception 'Choose automatic work settings';end if;
 perform pg_advisory_xact_lock(hashtextextended('autopilot:'||u::text,0));
 select * into s from finance_autopilot_settings where owner_id=u for update;
 if coalesce(s.revision,0)<>_expected then raise exception 'Your automatic work settings changed. Refresh first';end if;
 c:=finance_ai_status();
 if _enabled then
  if c->>'active' is null then raise exception 'Connect your AI provider first';end if;
  -- Turning on automatic work is explicit consent for this small, visible task set.
  -- Other module and web permissions remain separate; partner access is never changed.
  foreach x in array array['transactions','assets','close'] loop
   if x<>'transactions' and exists(select 1 from finance_module_preferences where owner_id=u and not(x=any(enabled_modules))) then continue;end if;
   select * into p from finance_ai_policies where owner_id=u and module=x;
   if p.mode='ai' and (case x when 'transactions' then array['receipts','categories'] when 'assets' then array['timing'] else array['review'] end)<@p.tasks and (case x when 'transactions' then array['receipts','categories'] when 'assets' then array['timing'] else '{}'::text[] end)<@p.auto_tasks then continue;end if;
   perform finance_set_ai_policy(x,'ai',array(select distinct t from unnest(coalesce(p.tasks,'{}')||case x when 'transactions' then array['receipts','categories'] when 'assets' then array['timing'] else array['review'] end) t),array(select distinct t from unnest(coalesce(p.auto_tasks,'{}')||case x when 'transactions' then array['receipts','categories'] when 'assets' then array['timing'] else '{}'::text[] end) t),coalesce(p.use_receipts,false),coalesce(p.use_web,false),coalesce(p.revision,0));
  end loop;
 end if;
 insert into finance_autopilot_settings(owner_id,enabled,provider,model,revision,status,summary)
 values(u,_enabled,c->>'active',(select v->>'model' from jsonb_array_elements(c->'connections') v where v->>'provider'=c->>'active'),coalesce(s.revision,0)+1,case when _enabled then 'ready' else 'paused' end,case when _enabled then 'Automatic work is ready. It runs while your AI workspace is open.' else 'Paused. A task already in progress may finish.' end)
 on conflict(owner_id) do update set enabled=excluded.enabled,provider=excluded.provider,model=excluded.model,revision=excluded.revision,status=excluded.status,summary=excluded.summary,updated_at=clock_timestamp();
end;$$;
create function finance_autopilot_begin(_owner uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s finance_autopilot_settings;l uuid:=gen_random_uuid();begin
 select * into s from finance_autopilot_settings where owner_id=_owner for update;
 if not found or not s.enabled then return jsonb_build_object('paused',true);end if;
 if s.lease_until>clock_timestamp() then return jsonb_build_object('busy',true);end if;
 update finance_autopilot_settings set lease=l,lease_until=clock_timestamp()+interval '5 minutes',status='working',updated_at=clock_timestamp() where owner_id=_owner;
 return jsonb_build_object('lease',l,'provider',s.provider,'model',s.model,'revision',s.revision);
end;$$;
create function finance_autopilot_end(_owner uuid,_lease uuid,_status text,_summary text,_attention jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 if _status not in('working','idle','needs_input','limit','error','paused') or jsonb_typeof(_attention)<>'array' or jsonb_array_length(_attention)>30 then raise exception 'Invalid automatic work status';end if;
 update finance_autopilot_settings set lease=null,lease_until=null,status=case when enabled then _status else 'paused' end,summary=left(_summary,1800),attention=_attention,updated_at=clock_timestamp() where owner_id=_owner and lease=_lease;
end;$$;
revoke all on function finance_configure_autopilot(boolean,integer),finance_autopilot_begin(uuid),finance_autopilot_end(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function finance_configure_autopilot(boolean,integer) to authenticated;
grant execute on function finance_autopilot_begin(uuid),finance_autopilot_end(uuid,uuid,text,text,jsonb) to service_role;
commit;
