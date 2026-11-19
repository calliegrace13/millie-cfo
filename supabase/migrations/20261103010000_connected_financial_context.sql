begin;
-- Private evidence overlays. No command in this service posts or edits money.
create table public.finance_context_records (
 id uuid primary key, owner_id uuid not null references auth.users(id),
 kind text not null check(kind in ('receipt','purchase','contract','person','life_event','other')),
 title text not null check(length(trim(title)) between 1 and 150),
 notes text not null default '' check(length(notes)<=4000),
 starts_on date, ends_on date, transaction_ids uuid[] not null default '{}',
 receipt jsonb, source_key text, snapshots jsonb not null default '{}',
 archived boolean not null default false, revision integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(owner_id,source_key), check(cardinality(transaction_ids)<=200 and array_position(transaction_ids,null) is null),
 check(starts_on is null or starts_on between '1900-01-01' and '2200-12-31'),
 check(ends_on is null or (starts_on is not null and ends_on>=starts_on and ends_on<='2200-12-31'))
);
create index finance_context_owner on finance_context_records(owner_id,updated_at);
create index finance_context_transactions on finance_context_records using gin(transaction_ids);
create table public.finance_context_history (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, record_id uuid not null,
 revision int not null, before_value jsonb, after_value jsonb not null, recorded_at timestamptz not null default now(),
 unique(record_id,revision)
);
alter table finance_context_records enable row level security;
alter table finance_context_history enable row level security;
revoke all on finance_context_records,finance_context_history from public,anon,authenticated;
grant select on finance_context_records,finance_context_history to authenticated;
grant all on finance_context_records,finance_context_history to service_role;
create policy context_own on finance_context_records for select to authenticated using(owner_id=auth.uid());
create policy context_history_own on finance_context_history for select to authenticated using(owner_id=auth.uid());
create function finance_context_audit() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 insert into finance_context_history(owner_id,record_id,revision,before_value,after_value)
 values(new.owner_id,new.id,new.revision,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));return new;
end;$$;
create trigger context_audit after insert or update on finance_context_records for each row execute function finance_context_audit();

create function finance_save_context(_id uuid,_expected int,_kind text,_title text,_notes text,_start date,_end date,_transactions uuid[],_archived boolean default false)
 returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); old finance_context_records; snaps jsonb; ids uuid[];begin
 if u is null then raise exception 'Sign in first';end if;
 if _id is null or _expected is null or _expected<0 or _kind is null or _title is null or _notes is null or _archived is null or _transactions is null or cardinality(_transactions)>200 or array_position(_transactions,null) is not null then raise exception 'Check the context fields';end if;
 perform pg_advisory_xact_lock(hashtextextended('context:'||u::text,0));
 select * into old from finance_context_records where id=_id for update;
 if found and old.owner_id<>u then raise exception 'Context unavailable';end if;
 select coalesce(array_agg(distinct x order by x),'{}') into ids from unnest(_transactions) x;
 if exists(select 1 from unnest(ids) x where not exists(select 1 from transactions t where t.id=x and t.user_id=u)
   and not (old.id is not null and x=any(old.transaction_ids))) then raise exception 'Choose your own available transactions';end if;
 if old.id is null and (_expected<>0 or _kind='receipt') then raise exception 'Refresh the evidence before saving';end if;
 if old.id is not null and old.kind<>_kind then raise exception 'Keep the existing context type';end if;
 select coalesce(jsonb_object_agg(x::text,coalesce((select jsonb_build_object('id',t.id,'name',coalesce(t.merchant_name,t.name),'date',t.date,'amount',t.amount,'currency',a.currency,'account',a.name) from transactions t left join accounts a on a.id=t.account_id where t.id=x and t.user_id=u),old.snapshots->x::text)),'{}') into snaps from unnest(ids) x;
 -- Safe replay after a network timeout, without adding another revision.
 if old.id is not null and (old.kind,old.title,old.notes,old.starts_on,old.ends_on,old.transaction_ids,old.archived) is not distinct from (_kind,trim(_title),_notes,_start,_end,ids,_archived) then return old.id;end if;
 if old.id is not null and old.revision<>_expected then raise exception 'This context changed. Refresh before saving';end if;
 if old.id is null then
  insert into finance_context_records(id,owner_id,kind,title,notes,starts_on,ends_on,transaction_ids,snapshots,archived)
  values(_id,u,_kind,trim(_title),_notes,_start,_end,ids,snaps,_archived);
 else update finance_context_records set title=trim(_title),notes=_notes,starts_on=_start,ends_on=_end,transaction_ids=ids,snapshots=snaps,archived=_archived,revision=revision+1,updated_at=clock_timestamp() where id=_id;end if;
 return _id;
end;$$;

-- Retain already-extracted evidence, not raw email bodies or credentials. A new
-- receipt is unlinked until the user confirms it; categories never prove a match.
create function finance_capture_context_receipts(_run uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare run finance_ai_receipt_runs;r jsonb;k text;begin
 select * into run from finance_ai_receipt_runs where id=_run and status='succeeded';
 if run.id is null or jsonb_typeof(run.result->'receipts') is distinct from 'array' then return;end if;
 for r in select value from jsonb_array_elements(run.result->'receipts') limit 40 loop
  if jsonb_typeof(r)<>'object' or coalesce(length(r->>'merchant'),0)=0 or jsonb_typeof(r->'items') is distinct from 'array' or length(r::text)>60000 then continue;end if;
  k:='receipt:'||md5(jsonb_build_object('merchant',lower(r->>'merchant'),'reference',r->>'reference','date',r->>'date','currency',r->>'currency','amount',r->'amount','items',(select jsonb_agg(i->>'name') from jsonb_array_elements(r->'items') i))::text);
  insert into finance_context_records(id,owner_id,kind,title,receipt,source_key)
  values(gen_random_uuid(),run.owner_id,'receipt',left(r->>'merchant',150),r-'source',k) on conflict(owner_id,source_key) do nothing;
 end loop;
end;$$;
create function finance_context_receipt_trigger() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 if new.status='succeeded' then perform finance_capture_context_receipts(new.id);end if;return new;
end;$$;
create trigger context_receipt_capture after insert or update of status,result on finance_ai_receipt_runs for each row execute function finance_context_receipt_trigger();
do $$declare r record;begin for r in select id from finance_ai_receipt_runs where status='succeeded' loop perform finance_capture_context_receipts(r.id);end loop;end;$$;

-- Connection health only: never expose tokens, email bodies or callback secrets.
create function finance_context_connection_status() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('email',(select jsonb_build_object('mailbox',mailbox,'autoSync',auto_sync,'lastSync',last_synced_at,'hasMore',sync_cursor is not null,'windowDays',window_days) from finance_email_connections where owner_id=auth.uid()),
 'queuedEmails',(select count(*) from finance_email_receipts where owner_id=auth.uid() and not dismissed and expires_at>now()),
 'banks',coalesce((select jsonb_agg(jsonb_build_object('name',institution_name,'lastSync',last_synced_at)) from plaid_items where user_id=auth.uid()),'[]'::jsonb));
$$;
revoke all on function finance_context_audit(),finance_capture_context_receipts(uuid),finance_context_receipt_trigger(),finance_save_context(uuid,int,text,text,text,date,date,uuid[],boolean),finance_context_connection_status() from public,anon,authenticated;
grant execute on function finance_save_context(uuid,int,text,text,text,date,date,uuid[],boolean),finance_context_connection_status() to authenticated;
grant execute on function finance_capture_context_receipts(uuid) to service_role;
comment on table finance_context_records is 'Owner-private explanatory context. Links never post, reclassify, allocate or restate financial activity. Source snapshots and revisions survive unlinks. Included by the existing public-table backup.';
commit;
