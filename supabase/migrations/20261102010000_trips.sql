begin;
-- Trips are private overlays on the existing ledger. They never post or recategorize money.
create table finance_trips(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),
 name text not null check(length(trim(name)) between 1 and 150),destination text not null default '' check(length(destination)<=200),
 starts_on date not null,ends_on date not null,auto_dates boolean not null default false,auto_receipts boolean not null default false,
 account_ids uuid[] not null default '{}',archived boolean not null default false,revision int not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(starts_on between '1900-01-01' and '2200-12-31' and ends_on>=starts_on and ends_on<=starts_on+366)
);
create table finance_trip_links(
 owner_id uuid not null references auth.users(id),transaction_id uuid not null,trip_id uuid references finance_trips(id),
 source text not null check(source in('date','receipt','manual','refund')),manual boolean not null default false,
 excluded boolean not null default false,reason text not null default '',snapshot jsonb not null default '{}',
 revision int not null default 1,updated_at timestamptz not null default now(),primary key(owner_id,transaction_id),
 check(not excluded or trip_id is null)
);
create table finance_trip_receipts(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),fingerprint text not null,
 run_id uuid not null references finance_ai_receipt_runs(id),receipt jsonb not null,
 transaction_id uuid,trip_id uuid references finance_trips(id),status text not null default 'pending' check(status in('pending','matched','manual','dismissed')),
 reason text not null default '',created_at timestamptz not null default now(),unique(owner_id,fingerprint)
);
create table finance_trip_history(id uuid primary key default gen_random_uuid(),owner_id uuid not null,record_id uuid not null,record_type text not null,before_value jsonb,after_value jsonb,recorded_at timestamptz not null default now());
create index trip_dates on finance_trips(owner_id,starts_on,ends_on) where not archived;
create index trip_links_trip on finance_trip_links(trip_id);
create index trip_receipts_owner on finance_trip_receipts(owner_id,status);
alter table finance_trips enable row level security;alter table finance_trip_links enable row level security;alter table finance_trip_receipts enable row level security;alter table finance_trip_history enable row level security;
revoke all on finance_trips,finance_trip_links,finance_trip_receipts,finance_trip_history from public,anon,authenticated;
grant select on finance_trips,finance_trip_links,finance_trip_receipts,finance_trip_history to authenticated;
grant all on finance_trips,finance_trip_links,finance_trip_receipts,finance_trip_history to service_role;
create policy trips_own on finance_trips for select to authenticated using(owner_id=auth.uid());
create policy trip_links_own on finance_trip_links for select to authenticated using(owner_id=auth.uid());
create policy trip_receipts_own on finance_trip_receipts for select to authenticated using(owner_id=auth.uid());
create policy trip_history_own on finance_trip_history for select to authenticated using(owner_id=auth.uid());
create function finance_trip_audit() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 insert into finance_trip_history(owner_id,record_id,record_type,before_value,after_value) values(new.owner_id,case when tg_table_name='finance_trip_links' then (to_jsonb(new)->>'transaction_id')::uuid else (to_jsonb(new)->>'id')::uuid end,tg_table_name,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));return new;end;$$;
create trigger trip_audit after insert or update on finance_trips for each row execute function finance_trip_audit();
create trigger trip_link_audit after insert or update on finance_trip_links for each row execute function finance_trip_audit();

create function finance_trip_eligible(_tx transactions) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select _tx.amount>0 and not coalesce(_tx.pending,false) and _tx.linked_transfer_id is null
 and lower(coalesce(_tx.category,'')) not in('transfer','credit card payment','reimbursement','settlement','income','salary','investment','investments','debt payment')
 and coalesce(_tx.classification_kind,'') not in('transfer','card_payment','income','investment','debt_principal','debt_payment')
 and exists(select 1 from accounts a where a.id=_tx.account_id and a.user_id=_tx.user_id and a.type not in('investment','loan'))
 and not exists(select 1 from finance_account_sharing s where s.account_id=_tx.account_id and s.duplicate_of is not null)
 and not exists(select 1 from finance_account_continuity c where (c.source_id=_tx.account_id and _tx.date<c.starts_on) or (c.original_id=_tx.account_id and _tx.date>=c.starts_on));
$$;
create function finance_trip_words(_v text) returns text[] language sql immutable set search_path=public,pg_temp as $$
 select coalesce(array_agg(w),'{}') from regexp_split_to_table(lower(regexp_replace(coalesce(_v,''),'[^a-zA-Z0-9]+',' ','g')),'\s+') w where length(w)>=3 and w not in('www','com','inc','llc','store','purchase','payment','card','online','marketplace');$$;
create function finance_trip_receipt_matches(_r jsonb,_t transactions) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select finance_trip_eligible(_t) and round(_t.amount::numeric,2)=round((_r->>'amount')::numeric,2)
 and _t.date between (_r->>'date')::date-1 and (_r->>'date')::date+10
 and exists(select 1 from accounts a where a.id=_t.account_id and coalesce(a.currency,'USD')=_r->>'currency')
 and cardinality(finance_trip_words(_r->>'merchant'))>0 and finance_trip_words(_r->>'merchant')<@finance_trip_words(coalesce(_t.merchant_name,'')||' '||_t.name);$$;
create function finance_trip_write_link(_owner uuid,_tx uuid,_trip uuid,_source text,_manual boolean,_excluded boolean,_reason text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare snap jsonb;begin
 select jsonb_build_object('id',t.id,'account_id',t.account_id,'date',t.date,'name',coalesce(t.merchant_name,t.name),'amount',t.amount,'currency',coalesce(a.currency,'USD'),'account',a.name,'bank',a.provider_institution_name,'mask',a.mask) into snap from transactions t left join accounts a on a.id=t.account_id where t.id=_tx and t.user_id=_owner;
 if snap is null then raise exception 'Purchase unavailable';end if;
 insert into finance_trip_links(owner_id,transaction_id,trip_id,source,manual,excluded,reason,snapshot) values(_owner,_tx,_trip,_source,_manual,_excluded,_reason,snap)
 on conflict(owner_id,transaction_id) do update set trip_id=excluded.trip_id,source=excluded.source,manual=excluded.manual,excluded=excluded.excluded,reason=excluded.reason,snapshot=excluded.snapshot,revision=finance_trip_links.revision+1,updated_at=clock_timestamp()
 where (finance_trip_links.trip_id,finance_trip_links.source,finance_trip_links.manual,finance_trip_links.excluded,finance_trip_links.reason,finance_trip_links.snapshot) is distinct from (excluded.trip_id,excluded.source,excluded.manual,excluded.excluded,excluded.reason,excluded.snapshot);
end;$$;

-- Deterministic assignment: manual choice > receipt travel dates > purchase dates.
-- No provider calls occur here. The receipts were already explicitly analyzed.
create function finance_trip_refresh(_owner uuid,_only uuid default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare t transactions;r finance_trip_receipts;existing finance_trip_links;candidate uuid;trip_ids uuid[];tx_ids uuid[];receipt_ids uuid[];why text;can_receipts boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended('trips:'||_owner::text,0));
 if not exists(select 1 from finance_trips where owner_id=_owner) then return;end if;
 can_receipts:=exists(select 1 from finance_ai_policies where owner_id=_owner and module='transactions' and mode='ai' and 'receipts'=any(tasks));
 if can_receipts then
 for r in select * from finance_trip_receipts where owner_id=_owner and status not in('dismissed','manual') loop
  select array_agg(id) into tx_ids from transactions x where x.user_id=_owner and x.date between (r.receipt->>'date')::date-1 and (r.receipt->>'date')::date+10 and round(x.amount::numeric,2)=round((r.receipt->>'amount')::numeric,2) and finance_trip_receipt_matches(r.receipt,x);
  select array_agg(p.id) into trip_ids from finance_trips p where p.owner_id=_owner and not p.archived and p.auto_receipts
   and not exists(select 1 from jsonb_array_elements(r.receipt->'travel') v where (v->>'start_date')::date<p.starts_on or (v->>'end_date')::date>p.ends_on)
   and (cardinality(p.account_ids)=0 or (cardinality(tx_ids)=1 and exists(select 1 from transactions x where x.id=tx_ids[1] and x.account_id=any(p.account_ids))));
  why:=case when coalesce(cardinality(tx_ids),0)=0 then 'No matching posted purchase yet. Check the receipt total, merchant and purchase date.' when cardinality(tx_ids)>1 then 'More than one purchase matches. Choose the correct charge.' when coalesce(cardinality(trip_ids),0)=0 then 'No trip covers these travel dates with receipt matching enabled.' when cardinality(trip_ids)>1 then 'Travel dates fit more than one trip. Choose the trip.' else 'Travel dates and one bank purchase match.' end;
  update finance_trip_receipts set transaction_id=case when cardinality(tx_ids)=1 then tx_ids[1] end,trip_id=case when cardinality(trip_ids)=1 then trip_ids[1] end,status='pending',reason=why where id=r.id;
 end loop;end if;
 for t in select * from transactions x where x.user_id=_owner and (_only is null or x.id=_only or exists(select 1 from finance_trip_links l where l.owner_id=_owner and l.transaction_id=x.id and l.source='receipt') or exists(select 1 from finance_trip_receipts rr where rr.owner_id=_owner and rr.transaction_id=x.id and rr.status not in('dismissed','manual'))) loop
  select * into existing from finance_trip_links where owner_id=_owner and transaction_id=t.id;
  if existing.manual or exists(select 1 from finance_trips where id=existing.trip_id and (archived or (existing.source='date' and not auto_dates) or (existing.source='receipt' and not auto_receipts))) then continue;end if;
  candidate:=null;why:='';
  if finance_trip_eligible(t) then
   select array_agg(distinct trip_id),array_agg(id) into trip_ids,receipt_ids from finance_trip_receipts where owner_id=_owner and status not in('dismissed','manual') and transaction_id=t.id and trip_id is not null;
   if can_receipts and cardinality(trip_ids)=1 and not exists(select 1 from finance_trip_receipts where owner_id=_owner and transaction_id=t.id and status not in('dismissed','manual') and trip_id is null) then candidate:=trip_ids[1];why:='Receipt travel dates';
   elsif can_receipts and cardinality(trip_ids)>1 then why:='Conflicting booking receipts; choose a trip';
   elsif exists(select 1 from finance_trip_receipts where owner_id=_owner and status not in('dismissed','manual') and (transaction_id=t.id or finance_trip_receipt_matches(receipt,t))) then why:='Booking needs a trip choice';
   else
    select array_agg(id) into trip_ids from finance_trips where owner_id=_owner and not archived and auto_dates and t.date between starts_on and ends_on and (cardinality(account_ids)=0 or t.account_id=any(account_ids));
    if cardinality(trip_ids)=1 then candidate:=trip_ids[1];why:='Purchase during trip dates';elsif cardinality(trip_ids)>1 then why:='Overlapping trip dates; choose a trip';end if;
   end if;
  end if;
  if candidate is not null or existing.trip_id is not null then
   -- Switching AI off retains previous receipt assignments. It does not rewrite history.
   if not can_receipts and existing.source='receipt' then continue;end if;
   perform finance_trip_write_link(_owner,t.id,candidate,case when why='Receipt travel dates' then 'receipt' else 'date' end,false,false,why);
   if candidate is not null then update finance_trip_receipts set status='matched',reason=why where owner_id=_owner and transaction_id=t.id and trip_id=candidate and status not in('dismissed','manual');end if;
  end if;
 end loop;
end;$$;

create function finance_save_trip(_id uuid,_expected int,_name text,_destination text,_start date,_end date,_auto_dates boolean,_auto_receipts boolean,_accounts uuid[],_archived boolean default false) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid();p finance_trips;v uuid;begin
 if u is null then raise exception 'Sign in first';end if;perform pg_advisory_xact_lock(hashtextextended('trips:'||u::text,0));
 if _accounts is null or cardinality(_accounts)>100 or array_position(_accounts,null) is not null or exists(select 1 from unnest(_accounts) a where not exists(select 1 from accounts where id=a and user_id=u)) then raise exception 'Choose your own accounts';end if;
 if _id is null then
  if _expected<>0 then raise exception 'Refresh the trip';end if;
  insert into finance_trips(owner_id,name,destination,starts_on,ends_on,auto_dates,auto_receipts,account_ids,archived) values(u,trim(_name),trim(_destination),_start,_end,_auto_dates,_auto_receipts,_accounts,_archived) returning id into v;
 else
  select * into p from finance_trips where id=_id and owner_id=u for update;if not found or p.revision<>_expected then raise exception 'Trip changed. Refresh before saving';end if;
  update finance_trips set name=trim(_name),destination=trim(_destination),starts_on=_start,ends_on=_end,auto_dates=_auto_dates,auto_receipts=_auto_receipts,account_ids=_accounts,archived=_archived,revision=revision+1,updated_at=clock_timestamp() where id=_id;v:=_id;
 end if;
 perform finance_trip_refresh(u);return v;
end;$$;
create function finance_assign_trip(_tx uuid,_trip uuid,_expected int,_automatic boolean default false,_receipt uuid default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid();l finance_trip_links;t transactions;begin
 if u is null then raise exception 'Sign in first';end if;perform pg_advisory_xact_lock(hashtextextended('trips:'||u::text,0));
 select * into l from finance_trip_links where owner_id=u and transaction_id=_tx;
 if coalesce(l.revision,0)<>_expected then raise exception 'Assignment changed. Refresh before saving';end if;
 select * into t from transactions where id=_tx and user_id=u;
 if not found or (_trip is not null and not finance_trip_eligible(t)) then raise exception 'Choose your own posted purchase, not an income or financial movement';end if;
 if _trip is not null and not exists(select 1 from finance_trips where id=_trip and owner_id=u and not archived) then raise exception 'Choose your own active trip';end if;
 perform finance_trip_write_link(u,_tx,case when _automatic then null else _trip end,'manual',not _automatic,not _automatic and _trip is null,case when _automatic then 'Automatic matching restored' when _trip is null then 'Excluded by you' else 'Chosen by you' end);
 if _receipt is not null then
  if _automatic or _trip is null or not exists(select 1 from finance_trip_receipts where id=_receipt and owner_id=u) then raise exception 'Choose your booking and trip';end if;
  update finance_trip_receipts set transaction_id=_tx,trip_id=_trip,status='manual',reason='Purchase and trip chosen by you' where id=_receipt and owner_id=u;
 end if;
 perform finance_trip_refresh(u,_tx);
end;$$;
create function finance_refresh_trips() returns void language plpgsql security definer set search_path=public,pg_temp as $$begin if auth.uid() is null then raise exception 'Sign in first';end if;perform finance_trip_refresh(auth.uid());end;$$;
create function finance_dismiss_trip_receipt(_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin update finance_trip_receipts set status='dismissed',reason='Dismissed by you' where id=_id and owner_id=auth.uid();end;$$;

create function finance_trip_transaction_changed() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 if exists(select 1 from finance_trips where owner_id=new.user_id and not archived) then perform finance_trip_refresh(new.user_id,new.id);end if;return new;end;$$;
create trigger trip_transaction_changed after insert or update of date,amount,account_id,pending,merchant_name,name,category,linked_transfer_id,classification_kind on transactions for each row execute function finance_trip_transaction_changed();
create function finance_trip_receipt_ingest() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare r jsonb;fp text;begin
 if new.status<>'succeeded' or jsonb_typeof(new.result->'receipts') is distinct from 'array' then return new;end if;
 for r in select value from jsonb_array_elements(new.result->'receipts') loop
  if jsonb_typeof(r->'travel')='array' and jsonb_array_length(r->'travel')>0 then
   fp:=md5(jsonb_build_array(lower(r->>'merchant'),r->>'reference',r->>'date',r->>'amount',r->>'currency',r->'travel')::text);
   insert into finance_trip_receipts(owner_id,fingerprint,run_id,receipt) values(new.owner_id,fp,new.id,r) on conflict(owner_id,fingerprint) do nothing;
  end if;
 end loop;
 perform finance_trip_refresh(new.owner_id);return new;end;$$;
create trigger trip_receipt_ingest after update of status,result on finance_ai_receipt_runs for each row when(new.status='succeeded') execute function finance_trip_receipt_ingest();
revoke all on function finance_trip_audit(),finance_trip_eligible(transactions),finance_trip_words(text),finance_trip_receipt_matches(jsonb,transactions),finance_trip_write_link(uuid,uuid,uuid,text,boolean,boolean,text),finance_trip_refresh(uuid,uuid),finance_trip_transaction_changed(),finance_trip_receipt_ingest() from public,anon,authenticated;
grant execute on function finance_trip_refresh(uuid,uuid) to service_role;
revoke all on function finance_save_trip(uuid,int,text,text,date,date,boolean,boolean,uuid[],boolean),finance_assign_trip(uuid,uuid,int,boolean,uuid),finance_refresh_trips(),finance_dismiss_trip_receipt(uuid) from public,anon;
grant execute on function finance_save_trip(uuid,int,text,text,date,date,boolean,boolean,uuid[],boolean),finance_assign_trip(uuid,uuid,int,boolean,uuid),finance_refresh_trips(),finance_dismiss_trip_receipt(uuid) to authenticated;
commit;
