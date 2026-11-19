begin;
-- One click is one transaction: a stale or protected item rejects the whole batch.
create or replace function finance_save_merchant_review_batch(_routines jsonb,_purchases jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();r jsonb;x jsonb;t transactions;ids uuid[];n integer:=0;count_r integer:=0;pref uuid;bad boolean;
begin
 if u is null then raise exception 'Authentication required';end if;
 if jsonb_typeof(_routines) is distinct from 'array' or jsonb_typeof(_purchases) is distinct from 'array'
 or jsonb_array_length(_routines)>100 or jsonb_array_length(_purchases)>5000 or jsonb_array_length(_routines)+jsonb_array_length(_purchases)=0 then raise exception 'Choose purchases or up to 100 merchant routines';end if;
 if exists(select 1 from jsonb_array_elements(_routines) z where jsonb_typeof(z->'expected') is distinct from 'array' or jsonb_array_length(z->'expected')=0) then raise exception 'Missing purchase preview';end if;
 select array_agg((z->>'id')::uuid) into ids from (
  select value->'expected' z from jsonb_array_elements(_purchases)
  union all select e z from jsonb_array_elements(_routines) q cross join lateral jsonb_array_elements(q->'expected') e
 ) preview;
 if coalesce(cardinality(ids),0) not between 1 and 5000 or (select count(distinct id) from unnest(ids) id)<>cardinality(ids) then raise exception 'Choose distinct purchases, up to 5000 per approval';end if;
 if exists(select 1 from jsonb_array_elements(_routines) q group by q->>'key',q->>'currency' having count(*)>1) then raise exception 'One rule per merchant and currency';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 perform 1 from transactions where user_id=u and id=any(ids) order by id for update;
 -- Validate choices, then protect held history with one set-based context scan.
 for r in select value from jsonb_array_elements(_routines) loop
  if r->>'key' is null or length(r->>'key')>250 or r->>'key'!~'^(merchant:|entity:|service:)'
  or r->>'currency' is null or r->>'currency'!~'^[A-Z]{3}$' or r->>'max' is null or (r->>'max')::numeric<=0 or (r->>'max')::numeric>=1000000000 then raise exception 'Choose a merchant, currency and amount limit';end if;
 end loop;
 with previews as materialized (
  select e expected,q->>'category' category,q->>'key' key,q->>'currency' currency,(q->>'max')::numeric cap,true routine from jsonb_array_elements(_routines) q cross join lateral jsonb_array_elements(q->'expected') e
  union all select q->'expected',q->>'category',null,null,null,false from jsonb_array_elements(_purchases) q
 ), scopes as materialized (
  select payload->'reviewScope' scope from finance_documents where owner_id=u and kind='close' and payload->'reviewScope'->>'version'='1' and payload->'reviewScope'->>'ownerId'=u::text
 ), held_ids as materialized (
  select l->>'id' id from finance_documents d cross join lateral jsonb_array_elements(coalesce(d.payload->'lines','[]')) l where d.owner_id=u and d.kind='close' and d.payload->'reviewScope' is null and coalesce(d.payload->'options'->>'basis','')<>'proforma'
 ), plan_ids as materialized (
  select ap.disposal_transaction_id id from finance_accounting_plans ap where ap.owner_id=u and not ap.is_void
  union select (l->>'transaction_id')::uuid from finance_accounting_plans ap cross join lateral jsonb_array_elements(ap.payments) l where ap.owner_id=u and not ap.is_void
 )
 select exists(select 1 from previews e left join transactions tx on tx.id=(e.expected->>'id')::uuid and tx.user_id=u left join accounts a on a.id=tx.account_id and a.user_id=u
 where tx.id is null or a.id is null or coalesce(a.is_deleted,false) or not finance_routine_eligible(tx) or not finance_memory_purchase(tx)
 or e.category is null or length(trim(e.category)) not between 1 and 100 or trim(e.category) in('Income','Transfer','Credit Card Payment','Debt Payment','Reimbursement','Settlement','Other','Uncategorized')
 or e.expected is distinct from jsonb_build_object('id',tx.id,'updated_at',tx.updated_at,'amount',tx.amount,'date',tx.date,'account_id',tx.account_id,'category',tx.category)
 or (e.routine and (a.currency is distinct from e.currency or tx.amount>e.cap or finance_merchant_key(tx.merchant_name,tx.name,tx.provider_metadata) is distinct from e.key))
 or exists(select 1 from scopes where tx.date::text between scope->>'start' and scope->>'end' and scope->'accountIds' ? tx.account_id::text)
 or exists(select 1 from held_ids where id=tx.id::text) or exists(select 1 from plan_ids where id=tx.id)
 or exists(select 1 from transaction_offsets o where o.parent_transaction_id=tx.id or o.offset_transaction_id=tx.id)
 or exists(select 1 from finance_account_sharing fs where fs.owner_id=u and fs.account_id=tx.account_id and fs.duplicate_of is not null)
 or exists(select 1 from finance_account_continuity fc where fc.owner_id=u and ((fc.source_id=tx.account_id and tx.date<fc.starts_on) or (fc.original_id=tx.account_id and tx.date>=fc.starts_on)))) into bad;
 if bad then raise exception 'A purchase changed or is protected. Refresh before approving.';end if;
 for r in select value from jsonb_array_elements(_routines) loop
  insert into finance_merchant_preferences(owner_id,merchant_key,category,currency,auto_approve,max_amount) values(u,r->>'key',trim(r->>'category'),r->>'currency',true,(r->>'max')::numeric)
  on conflict(owner_id,merchant_key,currency) do update set category=excluded.category,auto_approve=true,max_amount=excluded.max_amount,updated_at=now() returning id into pref;
  update transactions set category=trim(r->>'category'),merchant_key=r->>'key',merchant_routine_id=pref,classification_kind='expense',classification_source='user',classification_locked=true,classification_confidence=1,classification_version='1.1',classification_reason='Approved together with your merchant routine; future exceptions remain reviewable.',income_type=null,needs_review=false
  where user_id=u and id in(select (value->>'id')::uuid from jsonb_array_elements(r->'expected'));
  n:=n+jsonb_array_length(r->'expected');count_r:=count_r+1;
 end loop;
 update transactions tx set category=trim(q->>'category'),merchant_key=finance_merchant_key(tx.merchant_name,tx.name,tx.provider_metadata),merchant_routine_id=null,classification_kind='expense',classification_source='user',classification_locked=true,classification_confidence=1,classification_reason='Your category correction is protected from future imports.',income_type=null,needs_review=false
 from jsonb_array_elements(_purchases) q where tx.user_id=u and tx.id=(q->'expected'->>'id')::uuid;
 n:=n+jsonb_array_length(_purchases);
 return jsonb_build_object('purchases',n,'routines',count_r);
end;$$;
revoke all on function finance_save_merchant_review_batch(jsonb,jsonb) from public,anon;
grant execute on function finance_save_merchant_review_batch(jsonb,jsonb) to authenticated;
commit;
