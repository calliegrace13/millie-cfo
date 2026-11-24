begin;
alter table finance_context_records add column link_rule text check(link_rule in ('single_candidate','same_day'));

-- One physical charge may support only one receipt, including archived receipts.
-- No transaction FK: retained evidence must survive a bank removing its source.
create table finance_receipt_charge_links (
 transaction_id uuid primary key,
 record_id uuid not null references finance_context_records(id) on delete cascade,
 owner_id uuid not null references auth.users(id)
);
create index finance_receipt_charge_record on finance_receipt_charge_links(record_id);
alter table finance_receipt_charge_links enable row level security;
revoke all on finance_receipt_charge_links from public,anon,authenticated;
grant select on finance_receipt_charge_links to authenticated;
grant all on finance_receipt_charge_links to service_role;
create policy receipt_charge_own on finance_receipt_charge_links for select to authenticated using(owner_id=auth.uid());
-- Fail rather than silently choose a receipt if legacy links conflict.
insert into finance_receipt_charge_links(transaction_id,record_id,owner_id)
 select distinct unnest(transaction_ids),id,owner_id from finance_context_records where kind='receipt';

create function finance_context_receipt_charge_guard() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$begin
 delete from finance_receipt_charge_links where record_id=new.id;
 if new.kind='receipt' then
  begin
   insert into finance_receipt_charge_links(transaction_id,record_id,owner_id)
    select distinct x,new.id,new.owner_id from unnest(new.transaction_ids) x;
  exception when unique_violation then
   raise exception 'This charge already has a receipt. Unlink that receipt before choosing another one.';
  end;
 end if;
 return new;
end;$$;
create trigger context_receipt_charge_guard after insert or update of transaction_ids,kind,owner_id on finance_context_records
 for each row execute function finance_context_receipt_charge_guard();
revoke all on function finance_context_receipt_charge_guard() from public,anon,authenticated,service_role;

-- Updated matching implementation follows. A unique same-day option wins over
-- nearby options; two same-day options or two same-day receipts remain review work.

create or replace function finance_auto_link_context_receipts_for_owner(_owner uuid) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare linked integer;total_linked integer:=0;pass integer;begin
 if _owner is null then raise exception 'Owner required';end if;
 perform pg_advisory_xact_lock(hashtextextended('ai-policy:'||_owner::text,0));
 if not exists(select 1 from finance_ai_policies where owner_id=_owner and module='transactions' and mode='ai' and 'receipts'=any(tasks)) then return 0;end if;
 perform pg_advisory_xact_lock(hashtextextended('context:'||_owner::text,0));
 for pass in 1..50 loop
 with receipts as materialized (
  select r.*,case when pg_input_is_valid(receipt->>'date','date') then (receipt->>'date')::date end purchase_date,
   case when jsonb_typeof(receipt->'amount')='number' then (receipt->>'amount')::numeric end total,
   finance_receipt_merchant_words(receipt->>'merchant') merchant_words
  from finance_context_records r where owner_id=_owner and kind='receipt' and not archived
 ), base as materialized (
  select r.id record_id,t.id transaction_id,t.date=r.purchase_date same_day,
   cardinality(r.merchant_words)>0 and r.merchant_words<@finance_receipt_merchant_words(coalesce(t.merchant_name,'')||' '||t.name) merchant_fit
  from receipts r join transactions t on t.user_id=_owner
  join accounts a on a.id=t.account_id and a.user_id=_owner
  where cardinality(r.transaction_ids)=0 and not coalesce(t.pending,false) and t.amount>0 and round(t.amount,2)=round(r.total,2)
   and a.currency=r.receipt->>'currency' and t.date between r.purchase_date-1 and r.purchase_date+10
   and not exists(select 1 from finance_receipt_charge_links claim where claim.transaction_id=t.id)
   and a.type not in ('investment','loan') and t.linked_transfer_id is null
   and lower(coalesce(t.category,'')) not in ('transfer','credit card payment','reimbursement','settlement')
   and coalesce(t.classification_kind,'') not in ('income','debt_principal','debt_payment','investment')
   and not exists(select 1 from finance_account_sharing s where s.owner_id=_owner and s.account_id=a.id and s.duplicate_of is not null)
   and not exists(select 1 from finance_account_continuity c where c.owner_id=_owner and
    ((c.source_id=a.id and t.date<c.starts_on) or (c.original_id=a.id and t.date>=c.starts_on)))
 ), preferred as materialized (
  select b.* from base b where b.merchant_fit or not exists(select 1 from base other where other.record_id=b.record_id and other.merchant_fit)
 ), dated as materialized (
  select p.* from preferred p where p.same_day or not exists(select 1 from preferred d where d.record_id=p.record_id and d.same_day)
 ), unique_candidates as (
  select p.*,count(*) over(partition by record_id) options from dated p
 ), eligible as (
  select p.* from unique_candidates p join receipts r on r.id=p.record_id
  where p.options=1 and cardinality(r.transaction_ids)=0 and not r.auto_link_suppressed
   -- Same-day evidence wins over a nearby-date competitor, but equal-strength
   -- claims remain ambiguous. The unique claim table guards every write path.
   and not exists(select 1 from dated competitor where competitor.transaction_id=p.transaction_id and competitor.record_id<>p.record_id and (competitor.same_day or not p.same_day))
   and not exists(select 1 from receipts other where other.id<>p.record_id and p.transaction_id=any(other.transaction_ids))
 )
 update finance_context_records r set transaction_ids=array[e.transaction_id],link_source='automatic',
  link_basis=case when e.merchant_fit then 'merchant' else 'amount_date' end,link_rule=case when e.same_day then 'same_day' else 'single_candidate' end,
  snapshots=jsonb_build_object(t.id::text,jsonb_build_object('id',t.id,'name',coalesce(t.merchant_name,t.name),'date',t.date,'amount',t.amount,'currency',a.currency,'account',a.name)),
  revision=r.revision+1,updated_at=clock_timestamp()
 from eligible e join transactions t on t.id=e.transaction_id and t.user_id=_owner join accounts a on a.id=t.account_id
 where r.id=e.record_id and r.owner_id=_owner and cardinality(r.transaction_ids)=0 and not r.archived and not r.auto_link_suppressed;
 get diagnostics linked=row_count;total_linked:=total_linked+linked;exit when linked=0;
 end loop;return total_linked;
end;$$;
commit;
