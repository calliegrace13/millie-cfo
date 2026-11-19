
begin;
create table if not exists finance_email_connections(
 owner_id uuid primary key references auth.users(id) on delete cascade,
 mailbox text not null, credential text not null, auto_sync boolean not null default false,
 last_synced_at timestamptz, sync_cursor text, sync_query text, window_days int not null default 90,
 lease uuid, lease_until timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists finance_email_oauth_states(
 state_hash text primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 verifier text not null, claimed boolean not null default false, expires_at timestamptz not null default now()+interval '10 minutes'
);
create table if not exists finance_email_receipts(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references finance_email_connections(owner_id) on delete cascade,
 mailbox text not null,message_id text not null,subject text not null,sender text not null,sent_at timestamptz not null,
 body_cipher text not null,dismissed boolean not null default false,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '30 days',
 unique(owner_id,mailbox,message_id)
);
create table if not exists finance_email_seen(owner_id uuid not null references finance_email_connections(owner_id) on delete cascade,mailbox text not null,message_id text not null,primary key(owner_id,mailbox,message_id));
alter table finance_email_seen enable row level security;
revoke all on finance_email_seen from public,anon,authenticated;grant all on finance_email_seen to service_role;
alter table finance_email_connections enable row level security;
alter table finance_email_oauth_states enable row level security;
alter table finance_email_receipts enable row level security;
revoke all on finance_email_connections,finance_email_oauth_states,finance_email_receipts from public,anon,authenticated;
grant all on finance_email_connections,finance_email_oauth_states,finance_email_receipts to service_role;
create index if not exists finance_email_receipt_queue on finance_email_receipts(owner_id,created_at desc) where not dismissed;

create or replace function finance_email_claim_state(_hash text) returns jsonb language plpgsql security definer set search_path=public as $$
declare s finance_email_oauth_states;
begin
 update finance_email_oauth_states set claimed=true where state_hash=_hash and not claimed and expires_at>now() returning * into s;
 if not found then raise exception 'Email authorization expired or was already used';end if;
 return to_jsonb(s);
end;$$;
create or replace function finance_email_connect(_hash text,_owner uuid,_mailbox text,_credential text) returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from finance_email_oauth_states where state_hash=_hash and owner_id=_owner and claimed and expires_at>now() for update;
 if not found then raise exception 'Email authorization expired or was cancelled';end if;
 if exists(select 1 from finance_email_connections where owner_id=_owner and mailbox<>_mailbox) then delete from finance_email_receipts where owner_id=_owner;delete from finance_email_seen where owner_id=_owner;end if;
 insert into finance_email_connections(owner_id,mailbox,credential) values(_owner,_mailbox,_credential)
 on conflict(owner_id) do update set mailbox=excluded.mailbox,credential=excluded.credential,sync_cursor=null,sync_query=null,lease=null,lease_until=null,updated_at=now();
 delete from finance_email_oauth_states where owner_id=_owner;
end;$$;
create or replace function finance_email_begin_sync(_owner uuid,_query text,_window int,_fresh boolean) returns jsonb language plpgsql security definer set search_path=public as $$
declare c finance_email_connections;
begin
 select * into c from finance_email_connections where owner_id=_owner for update;
 if not found then raise exception 'Connect Gmail before syncing';end if;
 if c.lease_until>now() then raise exception 'A receipt sync is already running';end if;
 if _window not in (30,90,365,1095) or length(_query)>500 then raise exception 'Invalid sync window';end if;
 update finance_email_connections set lease=gen_random_uuid(),lease_until=now()+interval '2 minutes',
 sync_query=case when _fresh or sync_cursor is null then _query else sync_query end,
 sync_cursor=case when _fresh then null else sync_cursor end,
 window_days=case when _fresh or sync_cursor is null then _window else window_days end
 where owner_id=_owner returning * into c;
 return to_jsonb(c);
end;$$;
create or replace function finance_email_finish_sync(_owner uuid,_lease uuid,_rows jsonb,_cursor text) returns integer language plpgsql security definer set search_path=public as $$
declare c finance_email_connections;r jsonb;n int:=0;added int;
begin
 select * into c from finance_email_connections where owner_id=_owner and lease=_lease and lease_until>now() for update;
 if not found then raise exception 'Email connection changed during sync';end if;
 if jsonb_typeof(_rows)<>'array' or jsonb_array_length(_rows)>20 then raise exception 'Invalid receipt batch';end if;
 for r in select value from jsonb_array_elements(_rows) loop
  if (r->>'message_id') !~ '^[a-zA-Z0-9_-]{1,100}$' or length(r->>'body_cipher')>150000 then raise exception 'Invalid receipt';end if;
  insert into finance_email_seen(owner_id,mailbox,message_id) values(_owner,c.mailbox,r->>'message_id') on conflict do nothing;
  get diagnostics added=row_count;if added=0 then continue;end if;
  insert into finance_email_receipts(owner_id,mailbox,message_id,subject,sender,sent_at,body_cipher)
  values(_owner,c.mailbox,r->>'message_id',left(r->>'subject',300),left(r->>'sender',300),(r->>'sent_at')::timestamptz,r->>'body_cipher')
  on conflict(owner_id,mailbox,message_id) do nothing;
  get diagnostics added=row_count;n:=n+added;
 end loop;
 update finance_email_connections set sync_cursor=_cursor,last_synced_at=now(),lease=null,lease_until=null,updated_at=now() where owner_id=_owner and lease=_lease;
 return n;
end;$$;
create or replace function finance_email_disconnect(_owner uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 delete from finance_email_oauth_states where owner_id=_owner;
 delete from finance_email_connections where owner_id=_owner;
end;$$;
revoke all on function finance_email_claim_state(text),finance_email_connect(text,uuid,text,text),finance_email_begin_sync(uuid,text,int,boolean),finance_email_finish_sync(uuid,uuid,jsonb,text),finance_email_disconnect(uuid) from public,anon,authenticated;
grant execute on function finance_email_claim_state(text),finance_email_connect(text,uuid,text,text),finance_email_begin_sync(uuid,text,int,boolean),finance_email_finish_sync(uuid,uuid,jsonb,text),finance_email_disconnect(uuid) to service_role;
commit;
