begin;
alter table transactions add column merchant_routine_id uuid references finance_merchant_preferences(id) on delete set null;
create index transactions_merchant_routine on transactions(user_id,merchant_routine_id) where merchant_routine_id is not null;

-- Identity and purpose are checked separately: a payment or refund is never an ordinary purchase.
create function finance_memory_purchase(t transactions) returns boolean language sql immutable set search_path=public as $$
 select t.amount>0 and not coalesce(t.pending,false) and t.linked_transfer_id is null
 and not coalesce(t.is_transfer_exception,false) and not coalesce(t.is_one_time_expense,false) and not coalesce(t.is_amortized,false) and not coalesce(t.is_non_gaap_adjustment,false) and t.recognition_date is null
 and coalesce(t.cash_flow_type,'operating')='operating'
 and coalesce(t.classification_kind,'') not in('income','transfer','card_payment','debt_payment','refund')
 and coalesce(t.category,'') not in('Income','Transfer','Credit Card Payment','Debt Payment','Reimbursement','Settlement')
 and coalesce(t.provider_metadata->>'primary','') not in('INCOME','LOAN_PAYMENTS','TRANSFER_IN','TRANSFER_OUT')
 and coalesce(t.subcategory,'') !~ '^(INCOME|LOAN_PAYMENTS|TRANSFER_IN|TRANSFER_OUT)'
 and lower(coalesce(t.name,'')) !~ '\m(payment|pymt|pmt|autopay|transfer|xfer|payroll|salary|paycheck|refund|return|reversal|chargeback)\M';
$$;
create function finance_memory_open(t transactions) returns boolean language sql stable security definer set search_path=public as $$
 select not finance_closed_for_review(t.user_id,t.id,t.account_id,t.date)
 and exists(select 1 from accounts a where a.id=t.account_id and a.user_id=t.user_id and not coalesce(a.is_deleted,false))
 and not exists(select 1 from transaction_offsets o where o.parent_transaction_id=t.id or o.offset_transaction_id=t.id)
 and not exists(select 1 from finance_accounting_plans p where p.owner_id=t.user_id and not p.is_void and (p.disposal_transaction_id=t.id or exists(select 1 from jsonb_array_elements(p.payments) l where l->>'transaction_id'=t.id::text)))
 and not exists(select 1 from finance_account_sharing s where s.owner_id=t.user_id and s.account_id=t.account_id and s.duplicate_of is not null)
 and not exists(select 1 from finance_account_continuity c where c.owner_id=t.user_id and ((c.source_id=t.account_id and t.date<c.starts_on) or (c.original_id=t.account_id and t.date>=c.starts_on)));
$$;
revoke all on function finance_memory_purchase(transactions),finance_memory_open(transactions) from public,anon,authenticated;

create function finance_preview_transaction_memory(_id uuid,_category text,_max numeric default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();s transactions;k text;c text;p finance_merchant_preferences;cap numeric;items jsonb;total integer;eligible boolean;
begin
 if u is null or _category is null or length(trim(_category)) not between 1 and 100 then raise exception 'Choose a category';end if;
 select * into s from transactions where id=_id and user_id=u;
 if not found then raise exception 'Only the owner can review this purchase';end if;
 k:=finance_merchant_key(s.merchant_name,s.name,s.provider_metadata);
 select currency into c from accounts where id=s.account_id and user_id=u;
 select * into p from finance_merchant_preferences where owner_id=u and merchant_key=k and currency=c;
 cap:=coalesce(_max,greatest(coalesce(p.max_amount,0),ceil(s.amount*100)/100));
 eligible:=k is not null and c~'^[A-Z]{3}$' and finance_memory_purchase(s) and finance_memory_open(s)
 and trim(_category) not in('Income','Transfer','Credit Card Payment','Debt Payment','Reimbursement','Settlement','Other','Uncategorized');
 if eligible and (cap is null or cap<s.amount or cap<=0 or cap>=1000000000) then raise exception 'The limit must cover this purchase and be below one billion';end if;
 select count(*) into total from transactions t join accounts a on a.id=t.account_id and a.user_id=u where t.user_id=u and a.currency=c and finance_merchant_key(t.merchant_name,t.name,t.provider_metadata)=k;
 -- Narrow identities first and decompress held snapshots once, not once per purchase.
 with scoped as materialized (
  select t as tx,a.name account_name from transactions t join accounts a on a.id=t.account_id and a.user_id=u
  where eligible and t.user_id=u and a.currency=c and not coalesce(a.is_deleted,false)
  and finance_merchant_key(t.merchant_name,t.name,t.provider_metadata)=k and t.amount<=cap and finance_memory_purchase(t)
  and (t.id=s.id or t.merchant_routine_id=p.id or
   (t.classification_reason='Approved together with your merchant routine; future exceptions remain reviewable.' and t.classification_source='user') or
   (not coalesce(t.classification_locked,false) and coalesce(t.classification_source,'auto') not in('user','rule')))
 ), scopes as materialized (
  select payload->'reviewScope' scope from finance_documents where owner_id=u and kind='close'
  and payload->'reviewScope'->>'version'='1' and payload->'reviewScope'->>'ownerId'=u::text
 ), held_ids as materialized (
  select l->>'id' id from finance_documents d cross join lateral jsonb_array_elements(coalesce(d.payload->'lines','[]')) l
  where d.owner_id=u and d.kind='close' and d.payload->'reviewScope' is null and coalesce(d.payload->'options'->>'basis','')<>'proforma'
 ), plan_ids as materialized (
  select ap.disposal_transaction_id id from finance_accounting_plans ap where ap.owner_id=u and not ap.is_void
  union select (l->>'transaction_id')::uuid from finance_accounting_plans ap cross join lateral jsonb_array_elements(ap.payments) l where ap.owner_id=u and not ap.is_void
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',(r.tx).id,'stamp',md5(to_jsonb(r.tx)::text),'name',coalesce((r.tx).merchant_name,(r.tx).name),'date',(r.tx).date,'amount',(r.tx).amount,'account',r.account_name,'category',(r.tx).category) order by (r.tx).id),'[]'::jsonb) into items
 from scoped r where not exists(select 1 from scopes where (r.tx).date::text between scope->>'start' and scope->>'end' and scope->'accountIds' ? (r.tx).account_id::text)
 and not exists(select 1 from held_ids where id=(r.tx).id::text)
 and not exists(select 1 from plan_ids where id=(r.tx).id)
 and not exists(select 1 from transaction_offsets o where o.parent_transaction_id=(r.tx).id or o.offset_transaction_id=(r.tx).id)
 and not exists(select 1 from finance_account_sharing a where a.owner_id=u and a.account_id=(r.tx).account_id and a.duplicate_of is not null)
 and not exists(select 1 from finance_account_continuity a where a.owner_id=u and ((a.source_id=(r.tx).account_id and (r.tx).date<a.starts_on) or (a.original_id=(r.tx).account_id and (r.tx).date>=a.starts_on)));
 if jsonb_array_length(items)>5000 then raise exception 'Too many matching purchases. Use a narrower amount limit.';end if;
 return jsonb_build_object('category',trim(_category),'seed',jsonb_build_object('id',s.id,'stamp',md5(to_jsonb(s)::text)),'key',k,'currency',c,'max',cap,'eligible',coalesce(eligible,false),'preference',case when p.id is null then null else jsonb_build_object('id',p.id,'category',p.category,'max',p.max_amount,'active',p.auto_approve,'updated_at',p.updated_at) end,'matches',items,'excluded',total-jsonb_array_length(items));
end;$$;
revoke all on function finance_preview_transaction_memory(uuid,text,numeric) from public,anon;
grant execute on function finance_preview_transaction_memory(uuid,text,numeric) to authenticated;

create function finance_save_transaction_memory(_id uuid,_category text,_max numeric,_scope text,_expected jsonb) returns integer language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();fresh jsonb;pref uuid;n integer;
begin
 if u is null or _scope not in('one','matching') or _scope is null then raise exception 'Choose this purchase or matching purchases';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 perform 1 from transactions where user_id=u and (id=_id or id in(select (value->>'id')::uuid from jsonb_array_elements(_expected->'matches'))) order by id for update;
 fresh:=finance_preview_transaction_memory(_id,_category,_max);
 if fresh is distinct from _expected then raise exception 'Purchases or the rule changed. Refresh the preview before saving.';end if;
 if _scope='one' then
  perform finance_correct_category(_id,_category,false);
  update transactions set merchant_routine_id=null where id=_id and user_id=u;
  return 1;
 end if;
 if not (fresh->>'eligible')::boolean or jsonb_array_length(fresh->'matches')=0 then raise exception 'This purchase needs an individual review';end if;
 insert into finance_merchant_preferences(owner_id,merchant_key,category,currency,auto_approve,max_amount)
 values(u,fresh->>'key',trim(_category),fresh->>'currency',true,(fresh->>'max')::numeric)
 on conflict(owner_id,merchant_key,currency) do update set category=excluded.category,auto_approve=true,max_amount=excluded.max_amount,updated_at=now() returning id into pref;
 update transactions set category=trim(_category),merchant_key=fresh->>'key',merchant_routine_id=pref,classification_kind='expense',classification_source='user',classification_locked=true,classification_confidence=1,classification_version='1.1',classification_reason='Approved together with your merchant routine; future exceptions remain reviewable.',income_type=null,needs_review=false
 where user_id=u and id in(select (value->>'id')::uuid from jsonb_array_elements(fresh->'matches'));
 get diagnostics n=row_count;return n;
end;$$;
revoke all on function finance_save_transaction_memory(uuid,text,numeric,text,jsonb) from public,anon;
grant execute on function finance_save_transaction_memory(uuid,text,numeric,text,jsonb) to authenticated;
create or replace function finance_apply_merchant_routine_on_import() returns trigger language plpgsql security definer set search_path=public as $$
declare pref finance_merchant_preferences;k text;
begin
 if finance_closed_for_review(new.user_id,new.id,new.account_id,new.date) then return new;end if;
 if tg_op='UPDATE' and old.classification_source='auto' and (old.merchant_routine_id is not null or old.classification_reason='Within your confirmed merchant routine and amount limit.') then new.needs_review:=true;new.merchant_routine_id:=null;end if;
 if not finance_routine_eligible(new) or not finance_memory_purchase(new) or not finance_memory_open(new) then return new;end if;
 k:=finance_merchant_key(new.merchant_name,new.name,new.provider_metadata);
 select p.* into pref from finance_merchant_preferences p join accounts a on a.id=new.account_id and a.user_id=new.user_id where p.owner_id=new.user_id and p.merchant_key=k and p.auto_approve and p.currency=a.currency and new.amount<=p.max_amount;
 if not found then return new;end if;
 if exists(select 1 from transaction_offsets o where o.parent_transaction_id=new.id or o.offset_transaction_id=new.id) or exists(select 1 from finance_accounting_plans p where p.owner_id=new.user_id and not p.is_void and (p.disposal_transaction_id=new.id or exists(select 1 from jsonb_array_elements(p.payments) l where l->>'transaction_id'=new.id::text))) then return new;end if;
 new.merchant_routine_id:=pref.id;new.category:=pref.category;new.merchant_key:=k;new.needs_review:=false;new.classification_source:='auto';new.classification_kind:='expense';new.classification_confidence:=.98;new.classification_version:='1.1';new.classification_reason:='Within your confirmed merchant routine and amount limit.';
 return new;
end;$$;

commit;
