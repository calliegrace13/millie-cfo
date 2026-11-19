begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create schema if not exists millie_operations;
revoke all on schema millie_operations from public,anon,authenticated;
create table millie_operations.sync_state (
 item_id uuid primary key references public.plaid_items(id) on delete cascade,
 attempted_at timestamptz, succeeded_at timestamptz, error text,
 lease_until timestamptz, lease uuid
);
create table millie_operations.recovery (id boolean primary key default true check(id), envelope jsonb not null, updated_at timestamptz not null default now());
create table millie_operations.snapshots (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), payload jsonb not null);
alter table millie_operations.sync_state enable row level security;
alter table millie_operations.recovery enable row level security;
alter table millie_operations.snapshots enable row level security;
revoke all on all tables in schema millie_operations from public,anon,authenticated;

create function public.finance_sync_claim(_item uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare token uuid:=gen_random_uuid(); result uuid;
begin
 insert into millie_operations.sync_state(item_id,attempted_at,lease_until,lease)
 values(_item,now(),now()+interval '5 minutes',token)
 on conflict(item_id) do update set attempted_at=now(),lease_until=now()+interval '5 minutes',lease=token
 where millie_operations.sync_state.lease_until is null or millie_operations.sync_state.lease_until<now()
 returning lease into result; return result;
end $$;
create function public.finance_sync_finish(_item uuid,_lease uuid,_error text) returns void language plpgsql security definer set search_path=public as $$
declare owner uuid; previous_error text;
begin
 select error into previous_error from millie_operations.sync_state where item_id=_item and lease=_lease for update;
 if not found then raise exception 'Sync lease expired'; end if;
 select user_id into owner from public.plaid_items where id=_item;
 update millie_operations.sync_state set error=_error, succeeded_at=case when _error is null then now() else succeeded_at end,lease_until=null,lease=null where item_id=_item;
 if _error is null then
  update public.plaid_items set last_synced_at=now() where id=_item;
 elsif previous_error is distinct from _error then
  insert into public.notifications(user_id,title,body,type,link,reference_id,reference_type)
  values(owner,'Bank sync needs attention',_error,'sync_failure','/accounts',_item::text,'plaid_item');
 end if;
end $$;

-- A page and its cursor are committed together. Stable Plaid IDs, never fuzzy
-- merchant/amount matching, decide whether a record is already imported.
create function public.finance_apply_sync_page(_item uuid,_lease uuid,_added jsonb,_modified jsonb,_removed jsonb,_cursor text) returns integer language plpgsql security definer set search_path=public as $$
declare owner uuid; tx jsonb; acct uuid; existing uuid; count_added integer:=0;
begin
 if not exists(select 1 from millie_operations.sync_state where item_id=_item and lease=_lease and lease_until>now()) then raise exception 'Sync lease expired'; end if;
 select user_id into strict owner from public.plaid_items where id=_item;
 for tx in select value from jsonb_array_elements(coalesce(_added,'[]')) loop
  select id into acct from public.accounts where user_id=owner and plaid_account_id=tx->>'account_id' and not coalesce(is_deleted,false) limit 1;
  if acct is null then raise exception 'Account mapping missing'; end if;
  select id into existing from public.transactions where user_id=owner and plaid_transaction_id=tx->>'transaction_id' limit 1;
  if existing is null and nullif(tx->>'pending_transaction_id','') is not null then
   select id into existing from public.transactions where user_id=owner and account_id=acct and plaid_transaction_id=tx->>'pending_transaction_id' limit 1;
  end if;
  if existing is null then
   insert into public.transactions(user_id,account_id,account_name,plaid_transaction_id,name,merchant_name,amount,date,category,subcategory,pending,cash_flow_type,is_one_time_expense,income_type)
   select owner,acct,a.name,tx->>'transaction_id',tx->>'name',tx->>'merchant_name',(tx->>'amount')::numeric,(tx->>'date')::date,tx->>'category',tx->>'subcategory',(tx->>'pending')::boolean,coalesce(tx->>'cash_flow_type','operating')::public.cash_flow_category,coalesce((tx->>'is_one_time_expense')::boolean,false),case when tx->>'category'='Income' then 'other' else null end from public.accounts a where a.id=acct;
   count_added:=count_added+1;
  else
   update public.transactions set plaid_transaction_id=tx->>'transaction_id',name=tx->>'name',merchant_name=tx->>'merchant_name',amount=(tx->>'amount')::numeric,date=(tx->>'date')::date,pending=(tx->>'pending')::boolean where id=existing;
  end if;
 end loop;
 for tx in select value from jsonb_array_elements(coalesce(_modified,'[]')) loop
  update public.transactions set name=tx->>'name',merchant_name=tx->>'merchant_name',amount=(tx->>'amount')::numeric,date=(tx->>'date')::date,pending=(tx->>'pending')::boolean where user_id=owner and plaid_transaction_id=tx->>'transaction_id';
 end loop;
 for tx in select value from jsonb_array_elements(coalesce(_removed,'[]')) loop
  delete from public.transactions where user_id=owner and plaid_transaction_id=tx->>'transaction_id';
 end loop;
 if _cursor is not null then update public.plaid_items set cursor=_cursor where id=_item; end if;
 update millie_operations.sync_state set lease_until=now()+interval '5 minutes' where item_id=_item and lease=_lease;
 return count_added;
end $$;

create function public.finance_connection_status() returns table(id uuid,institution_name text,last_attempt timestamptz,last_success timestamptz,error text,syncing boolean) language sql security definer set search_path=public as $$
 select p.id,p.institution_name,s.attempted_at,s.succeeded_at,s.error,coalesce(s.lease_until>now(),false) from public.plaid_items p left join millie_operations.sync_state s on s.item_id=p.id where p.user_id=auth.uid();
$$;
create function public.finance_scheduler_authorized(_token text) returns boolean language sql security definer set search_path=public as $$
 select exists(select 1 from vault.decrypted_secrets where name='millie_scheduler_token' and decrypted_secret=_token and length(_token)>40);
$$;
create function public.finance_save_recovery(_envelope jsonb) returns void language sql security definer set search_path=public as $$
 insert into millie_operations.recovery(id,envelope) values(true,_envelope) on conflict(id) do update set envelope=excluded.envelope,updated_at=now();
$$;
create function public.finance_snapshot() returns uuid language plpgsql security definer set search_path=public as $$
declare t record; rows jsonb; payload jsonb:='{}'; snapshot_id uuid;
begin
 perform pg_advisory_xact_lock(hashtext('millie_snapshot'));
 for t in select schemaname,tablename from pg_tables where schemaname='public' or (schemaname='auth' and tablename in ('users','identities')) loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from %I.%I t',t.schemaname,t.tablename) into rows;
  payload:=payload||jsonb_build_object(t.schemaname||'.'||t.tablename,rows);
 end loop;
 payload:=payload||jsonb_build_object('recovery',(select envelope from millie_operations.recovery where id));
 insert into millie_operations.snapshots(payload) values(payload) returning id into snapshot_id;
 delete from millie_operations.snapshots where created_at<now()-interval '7 days';
 return snapshot_id;
end $$;

revoke all on function public.finance_sync_claim(uuid),public.finance_sync_finish(uuid,uuid,text),public.finance_apply_sync_page(uuid,uuid,jsonb,jsonb,jsonb,text),public.finance_scheduler_authorized(text),public.finance_save_recovery(jsonb),public.finance_snapshot() from public,anon,authenticated;
grant execute on function public.finance_sync_claim(uuid),public.finance_sync_finish(uuid,uuid,text),public.finance_apply_sync_page(uuid,uuid,jsonb,jsonb,jsonb,text),public.finance_scheduler_authorized(text),public.finance_save_recovery(jsonb),public.finance_snapshot() to service_role;
revoke all on function public.finance_connection_status() from public,anon;
grant execute on function public.finance_connection_status() to authenticated;
do $$ begin if not exists(select 1 from vault.secrets where name='millie_scheduler_token') then perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'millie_scheduler_token');end if;end $$;
commit;

