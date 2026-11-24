begin;
alter table finance_context_records
 add column link_source text not null default 'manual' check(link_source in ('manual','automatic')),
 add column link_basis text check(link_basis in ('merchant','amount_date')),
 add column auto_link_suppressed boolean not null default false;

create function finance_receipt_merchant_words(_value text) returns text[]
language sql immutable set search_path=public,pg_temp as $$
 select coalesce(array_agg(distinct w),'{}') from unnest(regexp_split_to_array(
  regexp_replace(lower(coalesce(_value,'')),'amzn|amazon\.com','amazon','g'),'[^a-z0-9]+')) w
 where length(w)>=3 and w<>all(array['www','com','inc','llc','store','purchase','payment','card','online','marketplace','mktpl']);
$$;

-- The result is computed server-side from owner-private evidence. A sole
-- displayed candidate may be amount/date only; that basis is retained in history.
create function finance_auto_link_context_receipts_for_owner(_owner uuid) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare linked integer;begin
 if _owner is null then raise exception 'Owner required';end if;
 perform pg_advisory_xact_lock(hashtextextended('ai-policy:'||_owner::text,0));
 if not exists(select 1 from finance_ai_policies where owner_id=_owner and module='transactions' and mode='ai' and 'receipts'=any(tasks)) then return 0;end if;
 perform pg_advisory_xact_lock(hashtextextended('context:'||_owner::text,0));
 with receipts as materialized (
  select r.*,case when pg_input_is_valid(receipt->>'date','date') then (receipt->>'date')::date end purchase_date,
   case when jsonb_typeof(receipt->'amount')='number' then (receipt->>'amount')::numeric end total,
   finance_receipt_merchant_words(receipt->>'merchant') merchant_words
  from finance_context_records r where owner_id=_owner and kind='receipt' and not archived
 ), base as materialized (
  select r.id record_id,t.id transaction_id,
   cardinality(r.merchant_words)>0 and r.merchant_words<@finance_receipt_merchant_words(coalesce(t.merchant_name,'')||' '||t.name) merchant_fit
  from receipts r join transactions t on t.user_id=_owner
  join accounts a on a.id=t.account_id and a.user_id=_owner
  where cardinality(r.transaction_ids)=0 and not coalesce(t.pending,false) and t.amount>0 and round(t.amount,2)=round(r.total,2)
   and a.currency=r.receipt->>'currency' and t.date between r.purchase_date-1 and r.purchase_date+10
   and a.type not in ('investment','loan') and t.linked_transfer_id is null
   and lower(coalesce(t.category,'')) not in ('transfer','credit card payment','reimbursement','settlement')
   and coalesce(t.classification_kind,'') not in ('income','debt_principal','debt_payment','investment')
   and not exists(select 1 from finance_account_sharing s where s.owner_id=_owner and s.account_id=a.id and s.duplicate_of is not null)
   and not exists(select 1 from finance_account_continuity c where c.owner_id=_owner and
    ((c.source_id=a.id and t.date<c.starts_on) or (c.original_id=a.id and t.date>=c.starts_on)))
 ), preferred as materialized (
  select b.* from base b where b.merchant_fit or not exists(select 1 from base other where other.record_id=b.record_id and other.merchant_fit)
 ), unique_candidates as (
  select p.*,count(*) over(partition by record_id) options from preferred p
 ), eligible as (
  select p.* from unique_candidates p join receipts r on r.id=p.record_id
  where p.options=1 and cardinality(r.transaction_ids)=0 and not r.auto_link_suppressed
   -- A competing receipt, even if it has several candidates, blocks automatic
   -- assignment. Existing manual links also reserve their transactions.
   and not exists(select 1 from preferred competitor where competitor.transaction_id=p.transaction_id and competitor.record_id<>p.record_id)
   and not exists(select 1 from receipts other where other.id<>p.record_id and p.transaction_id=any(other.transaction_ids))
 )
 update finance_context_records r set transaction_ids=array[e.transaction_id],link_source='automatic',
  link_basis=case when e.merchant_fit then 'merchant' else 'amount_date' end,
  snapshots=jsonb_build_object(t.id::text,jsonb_build_object('id',t.id,'name',coalesce(t.merchant_name,t.name),'date',t.date,'amount',t.amount,'currency',a.currency,'account',a.name)),
  revision=r.revision+1,updated_at=clock_timestamp()
 from eligible e join transactions t on t.id=e.transaction_id and t.user_id=_owner join accounts a on a.id=t.account_id
 where r.id=e.record_id and r.owner_id=_owner and cardinality(r.transaction_ids)=0 and not r.archived and not r.auto_link_suppressed;
 get diagnostics linked=row_count;return linked;
end;$$;

create function finance_auto_link_context_receipts() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 return finance_auto_link_context_receipts_for_owner(auth.uid());
end;$$;
revoke all on function finance_receipt_merchant_words(text),finance_auto_link_context_receipts_for_owner(uuid),finance_auto_link_context_receipts() from public,anon,authenticated;
grant execute on function finance_auto_link_context_receipts() to authenticated;
grant execute on function finance_auto_link_context_receipts_for_owner(uuid) to service_role;

-- Deterministic evidence linking is independent of paid AI work and its retry
-- state. Reconcile after the complete bank update, never on individual rows.
alter function finance_apply_sync_page(uuid,uuid,jsonb,jsonb,jsonb,text) rename to finance_apply_sync_page_before_context_link;
revoke all on function finance_apply_sync_page_before_context_link(uuid,uuid,jsonb,jsonb,jsonb,text) from public,anon,authenticated,service_role;
create function finance_apply_sync_page(_item uuid,_lease uuid,_added jsonb,_modified jsonb,_removed jsonb,_cursor text) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;owner uuid;begin
 n:=finance_apply_sync_page_before_context_link(_item,_lease,_added,_modified,_removed,_cursor);
 select user_id into strict owner from plaid_items where id=_item;
 perform finance_auto_link_context_receipts_for_owner(owner);return n;
end;$$;
revoke all on function finance_apply_sync_page(uuid,uuid,jsonb,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function finance_apply_sync_page(uuid,uuid,jsonb,jsonb,jsonb,text) to service_role;

alter function finance_capture_context_receipts(uuid) rename to finance_capture_context_receipts_before_link;
revoke all on function finance_capture_context_receipts_before_link(uuid) from public,anon,authenticated,service_role;
create function finance_capture_context_receipts(_run uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner uuid;begin
 perform finance_capture_context_receipts_before_link(_run);
 select owner_id into owner from finance_ai_receipt_runs where id=_run and status='succeeded';
 if owner is not null then perform finance_auto_link_context_receipts_for_owner(owner);end if;
end;$$;
revoke all on function finance_capture_context_receipts(uuid) from public,anon,authenticated;
grant execute on function finance_capture_context_receipts(uuid) to service_role;

-- Manual save override follows below: unlinked receipts remain suppressed until
-- the user explicitly chooses a purchase, so Undo never loops into auto-linking.

create or replace function finance_save_context(_id uuid,_expected int,_kind text,_title text,_notes text,_start date,_end date,_transactions uuid[],_archived boolean default false)
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
 else update finance_context_records set link_source=case when old.transaction_ids is distinct from ids then 'manual' else old.link_source end,link_basis=case when old.transaction_ids is distinct from ids then null else old.link_basis end,auto_link_suppressed=case when cardinality(ids)=0 and cardinality(old.transaction_ids)>0 then true when cardinality(ids)>0 then false else old.auto_link_suppressed end,title=trim(_title),notes=_notes,starts_on=_start,ends_on=_end,transaction_ids=ids,snapshots=snaps,archived=_archived,revision=revision+1,updated_at=clock_timestamp() where id=_id;end if;
 return _id;
end;$$;


commit;
