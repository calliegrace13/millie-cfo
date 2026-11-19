begin;
alter table finance_merchant_preferences add column currency text not null default '*' check(currency='*' or currency~'^[A-Z]{3}$'),add column auto_approve boolean not null default false,add column max_amount numeric check(max_amount>0 and max_amount<1000000000);
alter table finance_merchant_preferences drop constraint finance_merchant_preferences_owner_id_merchant_key_key,add unique(owner_id,merchant_key,currency);
-- Identical service identity in imports, previews and the database. A shared
-- provider entity must never combine Uber Eats with rides or subscriptions.
create function finance_merchant_key(_merchant text,_name text,_metadata jsonb) returns text language plpgsql immutable set search_path=public as $$
declare m text:=trim(regexp_replace(lower(coalesce(_merchant,'')),'[^a-z0-9]+',' ','g'));s text:=trim(regexp_replace(lower(coalesce(_merchant,'')||' '||coalesce(_name,'')),'[^a-z0-9]+',' ','g'));matched text;
begin
 if s~'\muber *(one|freight)\M' then return null;end if;
 if s~'\muber\M' then
  if s~'\muber *eats\M|\mubereats\M' then return 'service:uber-eats';end if;
  if s~'\m(one|membership|pass|freight)\M' then return null;end if;
  if s~'\m(trip|ride)\M' or m='uber' then return 'service:uber-rides';end if;return null;
 end if;
 if s~'\mubereats\M' then return 'service:uber-eats';end if;
 if m in('venmo','paypal','zelle','cash app','square','stripe','payment','transfer','unknown') then return null;end if;
 if nullif(_metadata->>'merchant_entity_id','') is not null then return 'entity:'||(_metadata->>'merchant_entity_id');end if;
 if m<>'' then return 'merchant:'||m;end if;
 matched:=substring(s from '\m(starbucks|dunkin|chipotle|mcdonalds|panera|sweetgreen|cava|shake shack|burger king|whole foods|trader joe s|kroger|safeway|publix|aldi|netflix|spotify|hulu)\M');
 return case when matched is not null then 'merchant:'||matched end;
end;$$;
create function finance_routine_eligible(t transactions) returns boolean language sql immutable set search_path=public as $$
 select t.amount>0 and not coalesce(t.pending,false) and t.needs_review and not t.classification_locked
 and t.classification_source not in('user','rule') and t.linked_transfer_id is null
 and not coalesce(t.is_transfer_exception,false) and not coalesce(t.is_one_time_expense,false) and not coalesce(t.is_amortized,false) and not coalesce(t.is_non_gaap_adjustment,false) and t.recognition_date is null
 and coalesce(t.category,'') not in('Income','Transfer','Credit Card Payment','Debt Payment','Reimbursement','Settlement')
 and coalesce(t.classification_kind,'') not in('income','transfer','card_payment','debt_payment')
 and coalesce(t.provider_metadata->>'primary','') not in('INCOME','LOAN_PAYMENTS','TRANSFER_IN','TRANSFER_OUT')
 and coalesce(t.subcategory,'') !~ '^(INCOME|LOAN_PAYMENTS|TRANSFER_IN|TRANSFER_OUT)'
 and lower(coalesce(t.name,'')) !~ '\m(payment|pymt|pmt|autopay|transfer|xfer|payroll|salary|paycheck|refund|return|reversal|chargeback)\M';
$$;
-- One preview confirmation is atomic; stale records abort the whole group.
create function finance_save_merchant_routine(_key text,_category text,_currency text,_max numeric,_expected jsonb) returns integer language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();x jsonb;t transactions;n integer:=0;
begin
 if u is null then raise exception 'Authentication required';end if;
 if _key is null or length(_key)>250 or _key!~'^(merchant:|entity:|service:)' or _category is null or length(trim(_category)) not between 1 and 100
 or trim(_category) in('Income','Transfer','Credit Card Payment','Debt Payment','Reimbursement','Settlement','Other','Uncategorized')
 or _currency!~'^[A-Z]{3}$' or _currency is null or _max is null or _max<=0 or _max>=1000000000
 or jsonb_typeof(_expected) is distinct from 'array' or jsonb_array_length(_expected) not between 1 and 5000 then raise exception 'Choose a merchant, spending category and amount limit';end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(_expected))<>jsonb_array_length(_expected) then raise exception 'Duplicate preview records';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 perform 1 from transactions where user_id=u and id in(select (value->>'id')::uuid from jsonb_array_elements(_expected)) order by id for update;
 for x in select value from jsonb_array_elements(_expected) loop
  select * into t from transactions where id=(x->>'id')::uuid and user_id=u;
  if not found or not finance_routine_eligible(t) or t.amount>_max or finance_merchant_key(t.merchant_name,t.name,t.provider_metadata) is distinct from _key
  or (select currency from accounts where id=t.account_id and user_id=u) is distinct from _currency
  or finance_closed_for_review(u,t.id,t.account_id,t.date)
  or exists(select 1 from transaction_offsets o where o.parent_transaction_id=t.id or o.offset_transaction_id=t.id)
  or exists(select 1 from finance_accounting_plans p where p.owner_id=u and not p.is_void and (p.disposal_transaction_id=t.id or exists(select 1 from jsonb_array_elements(p.payments) l where l->>'transaction_id'=t.id::text)))
  or exists(select 1 from finance_account_sharing s where s.owner_id=u and s.account_id=t.account_id and s.duplicate_of is not null)
  or exists(select 1 from finance_account_continuity c where c.owner_id=u and ((c.source_id=t.account_id and t.date<c.starts_on) or (c.original_id=t.account_id and t.date>=c.starts_on)))
  or x is distinct from jsonb_build_object('id',t.id,'updated_at',t.updated_at,'amount',t.amount,'date',t.date,'account_id',t.account_id,'category',t.category) then raise exception 'Preview changed or contains an exception; refresh your merchant groups';end if;
 end loop;
 insert into finance_merchant_preferences(owner_id,merchant_key,category,currency,auto_approve,max_amount) values(u,_key,trim(_category),_currency,true,_max)
 on conflict(owner_id,merchant_key,currency) do update set category=excluded.category,auto_approve=true,max_amount=excluded.max_amount,updated_at=now();
 update transactions set category=trim(_category),merchant_key=_key,classification_kind='expense',classification_source='user',classification_locked=true,classification_confidence=1,classification_version='1.1',classification_reason='Approved together with your merchant routine; future exceptions remain reviewable.',income_type=null,needs_review=false
 where user_id=u and id in(select (value->>'id')::uuid from jsonb_array_elements(_expected));get diagnostics n=row_count;
 return n;
end;$$;
revoke all on function finance_save_merchant_routine(text,text,text,numeric,jsonb) from public,anon;
grant execute on function finance_save_merchant_routine(text,text,text,numeric,jsonb) to authenticated;
create function finance_pause_merchant_routine(_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 update finance_merchant_preferences set auto_approve=false,updated_at=now() where id=_id and owner_id=auth.uid();
 if not found then raise exception 'Merchant routine not found';end if;
end;$$;
revoke all on function finance_pause_merchant_routine(uuid) from public,anon;
grant execute on function finance_pause_merchant_routine(uuid) to authenticated;
-- Individual corrections use the same service identity as the onboarding flow.
alter function finance_correct_category(uuid,text,boolean) rename to finance_correct_category_before_routines;
revoke all on function finance_correct_category_before_routines(uuid,text,boolean) from public,anon,authenticated;
create function finance_correct_category(_id uuid,_category text,_remember boolean default false) returns void language plpgsql security definer set search_path=public as $$
declare t transactions;k text;
begin
 select * into t from transactions where id=_id and user_id=auth.uid() for update;
 if not found then raise exception 'Only the owner can correct this transaction';end if;
 k:=finance_merchant_key(t.merchant_name,t.name,t.provider_metadata);
 if _remember and (k is null or trim(_category) in('Income','Transfer','Credit Card Payment','Debt Payment','Reimbursement','Settlement')) then raise exception 'Use a transaction-only correction for financial movements or unidentified merchants';end if;
 perform finance_correct_category_before_routines(_id,_category,false);
 update transactions set merchant_key=k where id=_id and user_id=auth.uid();
 if _remember then
  insert into finance_merchant_preferences(owner_id,merchant_key,category,auto_approve) values(auth.uid(),k,trim(_category),false)
  on conflict(owner_id,merchant_key,currency) do update set category=excluded.category,auto_approve=false,max_amount=null,updated_at=now();
  update finance_merchant_preferences set category=trim(_category),auto_approve=false,max_amount=null,updated_at=now() where owner_id=auth.uid() and merchant_key=k;
 end if;
end;$$;
revoke all on function finance_correct_category(uuid,text,boolean) from public,anon;
grant execute on function finance_correct_category(uuid,text,boolean) to authenticated;
revoke all on function finance_routine_eligible(transactions) from public,anon,authenticated;
-- CSV/manual imports can use routines too. Posted bank updates still receive
-- the richer classifier afterward. Never override edits, rules or held closes.
create function finance_apply_merchant_routine_on_import() returns trigger language plpgsql security definer set search_path=public as $$
declare pref finance_merchant_preferences;k text;
begin
 if finance_closed_for_review(new.user_id,new.id,new.account_id,new.date) then return new;end if;
 if tg_op='UPDATE' and old.classification_source='auto' and old.classification_reason='Within your confirmed merchant routine and amount limit.' then new.needs_review:=true;end if;
 if not finance_routine_eligible(new) then return new;end if;
 k:=finance_merchant_key(new.merchant_name,new.name,new.provider_metadata);
 select p.* into pref from finance_merchant_preferences p join accounts a on a.id=new.account_id and a.user_id=new.user_id where p.owner_id=new.user_id and p.merchant_key=k and p.auto_approve and p.currency=a.currency and new.amount<=p.max_amount;
 if not found then return new;end if;
 if exists(select 1 from transaction_offsets o where o.parent_transaction_id=new.id or o.offset_transaction_id=new.id) or exists(select 1 from finance_accounting_plans p where p.owner_id=new.user_id and not p.is_void and (p.disposal_transaction_id=new.id or exists(select 1 from jsonb_array_elements(p.payments) l where l->>'transaction_id'=new.id::text))) then return new;end if;
 new.category:=pref.category;new.merchant_key:=k;new.needs_review:=false;new.classification_source:='auto';new.classification_kind:='expense';new.classification_confidence:=.98;new.classification_version:='1.1';new.classification_reason:='Within your confirmed merchant routine and amount limit.';
 return new;
end;$$;
revoke all on function finance_apply_merchant_routine_on_import() from public,anon,authenticated;
create trigger finance_merchant_routine_import before insert or update of name,merchant_name,provider_metadata,amount,pending on transactions for each row execute function finance_apply_merchant_routine_on_import();
commit;
