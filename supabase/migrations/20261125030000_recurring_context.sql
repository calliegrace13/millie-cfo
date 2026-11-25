begin;
alter table finance_email_oauth_states add column calendar_only boolean not null default false;
create table finance_context_automation(owner_id uuid primary key references auth.users(id),enabled boolean not null default false,last_checked_at timestamptz,last_result jsonb not null default '{}');
create table finance_calendar_connections(owner_id uuid primary key references auth.users(id),mailbox text not null,credential text not null,auto_sync boolean not null default true,last_synced_at timestamptz,next_sync_at timestamptz not null default now(),lease_until timestamptz,status text not null default 'ready',error text);
create table finance_calendar_events(owner_id uuid not null references auth.users(id),source_calendar text not null,event_id text not null,payload jsonb not null,updated_at timestamptz not null default now(),primary key(owner_id,source_calendar,event_id));
create table finance_calendar_trip_sources(owner_id uuid not null references auth.users(id),source_key text not null,trip_id uuid not null references finance_trips(id),applied_revision integer not null,primary key(owner_id,source_key));
alter table finance_context_automation enable row level security;alter table finance_calendar_connections enable row level security;alter table finance_calendar_events enable row level security;alter table finance_calendar_trip_sources enable row level security;
revoke all on finance_context_automation,finance_calendar_connections,finance_calendar_events,finance_calendar_trip_sources from public,anon,authenticated;
grant all on finance_context_automation,finance_calendar_connections,finance_calendar_events,finance_calendar_trip_sources to service_role;
grant select on finance_context_automation,finance_calendar_events to authenticated;
create policy context_automation_own on finance_context_automation for select to authenticated using(owner_id=auth.uid());
create policy calendar_events_own on finance_calendar_events for select to authenticated using(owner_id=auth.uid());

create function finance_calendar_connect(_hash text,_owner uuid,_mailbox text,_credential text) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 if not exists(select 1 from finance_email_oauth_states where state_hash=_hash and owner_id=_owner and calendar_only and claimed and expires_at>now()) then raise exception 'Calendar authorization changed or expired';end if;
 insert into finance_calendar_connections(owner_id,mailbox,credential) values(_owner,_mailbox,_credential) on conflict(owner_id) do update set mailbox=excluded.mailbox,credential=excluded.credential,status='ready',error=null,next_sync_at=now();
 delete from finance_email_oauth_states where owner_id=_owner and state_hash=_hash;
end;$$;

create function finance_calendar_import(_owner uuid,_events jsonb,_trips jsonb,_credential text default null,_automatic boolean default false) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e jsonb;t jsonb;p finance_trips;m finance_calendar_trip_sources;v uuid;n integer:=0;begin
 if _owner is null or jsonb_typeof(_events) is distinct from 'array' or jsonb_array_length(_events)>2000 or jsonb_typeof(_trips) is distinct from 'array' or jsonb_array_length(_trips)>200 then raise exception 'Invalid calendar snapshot';end if;
 if _credential is not null then perform 1 from finance_calendar_connections where owner_id=_owner and credential=_credential and lease_until>now() and (not _automatic or auto_sync) for update;if not found then raise exception 'Calendar authorization changed during sync';end if;end if;
 perform pg_advisory_xact_lock(hashtextextended('trips:'||_owner::text,0));
 for e in select value from jsonb_array_elements(_events) loop
  if e->>'kind' not in('flight','stay','trip','reservation') or length(e->>'event_id') not between 1 and 300 or length(e->>'title')>200 or (e->>'ends_on')::date<(e->>'starts_on')::date then raise exception 'Invalid calendar event';end if;
  insert into finance_calendar_events(owner_id,source_calendar,event_id,payload) values(_owner,e->>'source_calendar',e->>'event_id',e)
  on conflict(owner_id,source_calendar,event_id) do update set payload=excluded.payload,updated_at=now() where finance_calendar_events.payload is distinct from excluded.payload;
 end loop;
 delete from finance_calendar_events c where c.owner_id=_owner and not exists(select 1 from jsonb_array_elements(_events) je(value) where je.value->>'source_calendar'=c.source_calendar and je.value->>'event_id'=c.event_id);
 for t in select value from jsonb_array_elements(_trips) loop
  if length(t->>'name') not between 1 and 150 or (t->>'ends_on')::date<(t->>'starts_on')::date or (t->>'ends_on')::date>(t->>'starts_on')::date+366 then raise exception 'Invalid calendar trip';end if;
  select * into m from finance_calendar_trip_sources where owner_id=_owner and source_key=t->>'source_key';
  if found then
   select * into p from finance_trips where id=m.trip_id and owner_id=_owner;
   if p.revision<>m.applied_revision then continue;end if;
   if (p.starts_on,p.ends_on,p.name,p.destination,p.auto_dates) is distinct from ((t->>'starts_on')::date,(t->>'ends_on')::date,t->>'name',left(t->>'destination',200),(t->>'auto_dates')::boolean) then
    update finance_trips set starts_on=(t->>'starts_on')::date,ends_on=(t->>'ends_on')::date,name=t->>'name',destination=left(t->>'destination',200),auto_dates=(t->>'auto_dates')::boolean,revision=revision+1,updated_at=now() where id=p.id returning revision into m.applied_revision;
    update finance_calendar_trip_sources set applied_revision=m.applied_revision where owner_id=_owner and source_key=t->>'source_key';
   end if;
  else
   -- An existing user-created trip covering the dates remains authoritative.
   if exists(select 1 from finance_trips where owner_id=_owner and not archived and starts_on<=(t->>'starts_on')::date and ends_on>=(t->>'ends_on')::date) then continue;end if;
   insert into finance_trips(owner_id,name,destination,starts_on,ends_on,auto_dates,auto_receipts) values(_owner,t->>'name',left(t->>'destination',200),(t->>'starts_on')::date,(t->>'ends_on')::date,(t->>'auto_dates')::boolean,true) returning id into v;
   insert into finance_calendar_trip_sources values(_owner,t->>'source_key',v,1);n:=n+1;
  end if;
 end loop;
 -- Removed/cancelled automatic itineraries stop accepting new assignments.
 update finance_trips ft set archived=true,revision=ft.revision+1,updated_at=now() from finance_calendar_trip_sources cm where cm.owner_id=_owner and ft.id=cm.trip_id and ft.revision=cm.applied_revision and not ft.archived and not exists(select 1 from jsonb_array_elements(_trips) jt(value) where jt.value->>'source_key'=cm.source_key);
 perform finance_trip_refresh(_owner);
 return jsonb_build_object('events',jsonb_array_length(_events),'tripsAdded',n);
end;$$;

-- Free deterministic cleanup. Never fabricate answers, dismiss preferences,
-- change permissions, or apply an unapproved budget, goal, or financial action.
create function finance_reconcile_inbox(_owner uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare w finance_assistant_items;reason text;resolved integer:=0;applied integer:=0;prior text:=current_setting('request.jwt.claim.sub',true);begin
 if not exists(select 1 from finance_context_automation where owner_id=_owner and enabled) then return '{}';end if;
 perform pg_advisory_xact_lock(hashtextextended('inbox:'||_owner::text,0));
 for w in select * from finance_assistant_items where owner_id=_owner and status='needs_input' and answer='' order by updated_at desc,id loop
  reason:=null;
  if w.module='transactions' and w.task='categories' and exists(select 1 from transactions t where t.user_id=_owner and t.id::text=w.payload->>'transaction_id' and not t.needs_review and not coalesce(t.pending,false)) then reason:='Purchase categorization is already resolved in the ledger';
  elsif exists(select 1 from finance_assistant_items newer where newer.owner_id=_owner and newer.id<>w.id and newer.kind='question' and newer.status='needs_input' and newer.module=w.module and newer.task=w.task and coalesce(newer.payload->>'transaction_id','')=coalesce(w.payload->>'transaction_id','') and newer.payload->'scope'=w.payload->'scope' and (coalesce(w.payload->>'transaction_id','')<>'' or (coalesce(newer.payload->>'title',''),coalesce(newer.payload->>'category',''),coalesce(newer.payload->>'account_id',''))=(coalesce(w.payload->>'title',''),coalesce(w.payload->>'category',''),coalesce(w.payload->>'account_id',''))) and lower(regexp_replace(newer.payload->>'question','\s+',' ','g'))=lower(regexp_replace(w.payload->>'question','\s+',' ','g')) and (newer.answer<>'' or (newer.updated_at,newer.id)>(w.updated_at,w.id))) then reason:='Duplicate question; the newer or answered copy is retained';end if;
  if reason is not null then
   insert into finance_assistant_history(owner_id,item_id,revision,action,payload) values(_owner,w.id,w.revision,'automatic_resolution',to_jsonb(w));
   update finance_assistant_items set status='done',result=coalesce(result,'{}')||jsonb_build_object('automaticResolution',reason),revision=revision+1,updated_at=now() where id=w.id and revision=w.revision;resolved:=resolved+1;
  end if;
 end loop;
 perform set_config('request.jwt.claim.sub',_owner::text,true);
 for w in select * from finance_assistant_items where owner_id=_owner and status='ready' and kind in('category','plan') and coalesce(payload->>'policy_hold','')='' order by created_at limit 50 loop
  begin perform finance_assistant_apply(w.id,w.revision,true);applied:=applied+1;exception when others then null;end;
 end loop;
 perform set_config('request.jwt.claim.sub',coalesce(prior,''),true);
 update finance_context_automation set last_checked_at=now(),last_result=jsonb_build_object('questionsResolved',resolved,'proposalsApplied',applied) where owner_id=_owner;
 return jsonb_build_object('questionsResolved',resolved,'proposalsApplied',applied);
end;$$;
create function finance_set_context_automation(_enabled boolean) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid();begin
 if u is null or _enabled is null then raise exception 'Sign in and choose an automation preference';end if;
 insert into finance_context_automation(owner_id,enabled) values(u,_enabled) on conflict(owner_id) do update set enabled=_enabled;
 return finance_reconcile_inbox(u);
end;$$;
revoke all on function finance_calendar_connect(text,uuid,text,text),finance_calendar_import(uuid,jsonb,jsonb,text,boolean),finance_reconcile_inbox(uuid) from public,anon,authenticated;
grant execute on function finance_calendar_connect(text,uuid,text,text),finance_calendar_import(uuid,jsonb,jsonb,text,boolean),finance_reconcile_inbox(uuid) to service_role;
revoke all on function finance_set_context_automation(boolean) from public,anon,authenticated;
grant execute on function finance_set_context_automation(boolean) to authenticated;

create function finance_calendar_begin(_owner uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c finance_calendar_connections;begin
 update finance_calendar_connections set lease_until=now()+interval '5 minutes',status='syncing' where owner_id=_owner and coalesce(lease_until,'-infinity')<now() returning * into c;
 if not found then return null;end if;return to_jsonb(c);
end;$$;
revoke all on function finance_calendar_begin(uuid) from public,anon,authenticated;
grant execute on function finance_calendar_begin(uuid) to service_role;

create or replace function finance_dispatch_autopilot() returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare token text;s record;n integer:=0;begin
 perform finance_ai_reap();select decrypted_secret into strict token from vault.decrypted_secrets where name='millie_scheduler_token';
 for s in select * from finance_autopilot_settings where enabled and background_enabled and next_run_at<=now() and coalesce(lease_until,'-infinity')<now() and (workflow_scope='all_enabled' or not exists(select 1 from finance_autopilot_work w where w.owner_id=finance_autopilot_settings.owner_id and w.status='failed')) and failure_count<3 order by next_run_at limit 5 for update skip locked loop
  perform net.http_post(url:='https://cdkqtoghirbegixbgfli.supabase.co/functions/v1/finance-autopilot',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body:=jsonb_build_object('action','step','workerOwner',s.owner_id),timeout_milliseconds:=180000);
  update finance_autopilot_settings set next_run_at=now()+interval '5 minutes' where owner_id=s.owner_id;n:=n+1;
 end loop;
 for s in select owner_id from finance_context_automation where enabled and coalesce(last_checked_at,'-infinity')<now()-interval '6 hours' order by last_checked_at nulls first limit 3 loop
  perform finance_reconcile_inbox(s.owner_id);
 end loop;
 for s in select * from finance_calendar_connections where auto_sync and next_sync_at<=now() and coalesce(lease_until,'-infinity')<now() order by next_sync_at limit 3 for update skip locked loop
  perform net.http_post(url:='https://cdkqtoghirbegixbgfli.supabase.co/functions/v1/calendar-context',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body:=jsonb_build_object('action','sync','workerOwner',s.owner_id),timeout_milliseconds:=120000);
  update finance_calendar_connections set next_sync_at=now()+interval '5 minutes' where owner_id=s.owner_id;
 end loop;return n;
end;$$;

create function finance_resolve_rechecked_questions(_owner uuid,_job uuid,_ids uuid[]) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare w finance_assistant_items;j finance_assistant_jobs;begin
 select * into j from finance_assistant_jobs where owner_id=_owner and id=_job and status='finished';if not found or cardinality(_ids)>20 then raise exception 'Rechecked job unavailable';end if;
 for w in select * from finance_assistant_items where owner_id=_owner and id=any(_ids) and status='needs_input' and answer='' and module=j.module and task=j.task loop
  if exists(select 1 from finance_assistant_items n where n.owner_id=_owner and n.job_id=_job and n.id<>w.id and n.payload->>'transaction_id'=w.payload->>'transaction_id' and n.status in('needs_input','ready','done')) then
   insert into finance_assistant_history(owner_id,item_id,revision,action,payload) values(_owner,w.id,w.revision,'rechecked_with_evidence',to_jsonb(w));
   update finance_assistant_items set status='done',result=jsonb_build_object('supersededByJob',_job),revision=revision+1,updated_at=now() where id=w.id;
  end if;
 end loop;
end;$$;
revoke all on function finance_resolve_rechecked_questions(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function finance_resolve_rechecked_questions(uuid,uuid,uuid[]) to service_role;

commit;
