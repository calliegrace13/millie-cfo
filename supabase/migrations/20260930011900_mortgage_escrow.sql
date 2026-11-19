begin;
alter table finance_accounting_plans add column opening_escrow numeric not null default 0 check(opening_escrow>=0 and opening_escrow<1000000000000), add column escrow_charges jsonb not null default '[]';
create or replace function finance_save_accounting_plan(_plan jsonb,_expected timestamptz default null) returns uuid language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();i uuid;old finance_accounting_plans;entry jsonb;t transactions;acct accounts;other accounts;links jsonb;kind text;interest numeric;escrow numeric;ids uuid[]:='{}';begin
 if u is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 i:=coalesce(nullif(_plan->>'id','')::uuid,gen_random_uuid());
 select * into old from finance_accounting_plans where id=i for update;
 if old.id is not null and (old.owner_id<>u or old.updated_at is distinct from _expected) then raise exception 'Plan changed or unavailable';end if;
 select * into acct from accounts where id=(_plan->>'account_id')::uuid and user_id=u;
 if acct.id is null then raise exception 'Choose your account';end if;
 if coalesce((_plan->>'is_void')::boolean,false) then
 if old.id is null then raise exception 'Only saved plans can be voided';end if;insert into finance_accounting_plan_audit(owner_id,payload) values(u,to_jsonb(old));update finance_accounting_plans set is_void=true,updated_at=clock_timestamp() where id=i;return i;end if;
 kind:=_plan->>'kind';links:=coalesce(_plan->'payments','[]');
 if jsonb_typeof(links)<>'array' or jsonb_array_length(links)>1000 then raise exception 'Invalid payments';end if;
 if nullif(_plan->>'balance_account_id','') is not null then
 select * into other from accounts where id=(_plan->>'balance_account_id')::uuid and user_id=u;
 if kind<>'loan' or other.id is null or other.type not in ('loan','credit') or coalesce(other.currency,'USD')<>coalesce(acct.currency,'USD') then raise exception 'Choose a matching tracked debt account';end if;end if;
 for entry in select * from jsonb_array_elements(links) loop
 select * into t from transactions where id=(entry->>'transaction_id')::uuid and user_id=u for update;
 interest:=coalesce((entry->>'interest')::numeric,0);escrow:=coalesce((entry->>'escrow')::numeric,0);
 if t.id is null or t.pending or t.account_id<>acct.id or (kind='loan' and t.date<(_plan->>'start_date')::date) or t.is_amortized then raise exception 'Choose posted payments from this account on or after the start date, without another schedule';end if;
 if t.id=any(ids) or exists(select 1 from finance_accounting_plans p,jsonb_array_elements(p.payments) l where p.id<>i and not p.is_void and p.owner_id=u and l->>'transaction_id'=t.id::text) then raise exception 'Payment already assigned';end if;ids:=array_append(ids,t.id);
 if interest<0 or escrow<0 or interest+escrow>abs(t.amount) or (kind<>'loan' and (interest<>0 or escrow<>0)) or (kind='loan' and t.amount<=0) then raise exception 'Invalid payment split';end if;
 if (t.linked_transfer_id is not null or lower(coalesce(t.category,'')) in ('transfer','credit card payment','settlement','reimbursement')) and kind<>'loan' then raise exception 'Internal transfers cannot fund this plan';end if;
 end loop;
 if nullif(_plan->>'disposal_transaction_id','') is not null then
 select * into t from transactions where id=(_plan->>'disposal_transaction_id')::uuid and user_id=u for update;
 if t.id is null or t.pending or t.amount>=0 or t.account_id<>acct.id or t.is_amortized or t.linked_transfer_id is not null or t.date::text is distinct from _plan->>'disposal_date' or t.id=any(ids) then raise exception 'Choose the posted disposal receipt on the disposal date';end if;
 if exists(select 1 from finance_accounting_plans p where p.id<>i and not p.is_void and (p.disposal_transaction_id=t.id or exists(select 1 from jsonb_array_elements(p.payments) l where l->>'transaction_id'=t.id::text))) then raise exception 'Receipt already assigned';end if;
 end if;
 if exists(select 1 from finance_accounting_plans p where p.id<>i and not p.is_void and p.disposal_transaction_id=any(ids)) then raise exception 'Payment already assigned to disposal';end if;
 if jsonb_typeof(coalesce(_plan->'escrow_charges','[]'))<>'array' then raise exception 'Invalid escrow expenses';end if;
 for entry in select * from jsonb_array_elements(coalesce(_plan->'escrow_charges','[]')) loop
 if kind<>'loan' or entry->>'date' is null or not isfinite((entry->>'date')::date) or (entry->>'date')::date<(_plan->>'start_date')::date or coalesce((entry->>'amount')::numeric,0)<=0 or (entry->>'amount')::numeric>=1000000000000 or length(coalesce(trim(entry->>'category'),''))=0 then raise exception 'Invalid escrow expense';end if;
 end loop;
 update transactions set needs_review=false where user_id=u and (id=any(ids) or id=nullif(_plan->>'disposal_transaction_id','')::uuid);
 if old.id is not null then insert into finance_accounting_plan_audit(owner_id,payload) values(u,to_jsonb(old));end if;
 insert into finance_accounting_plans(id,owner_id,account_id,name,kind,category,total_amount,residual_value,start_date,end_date,opening_settled,stop_date,disposal_date,disposal_transaction_id,balance_account_id,payments,opening_escrow,escrow_charges)
 values(i,u,acct.id,trim(_plan->>'name'),kind,trim(_plan->>'category'),(_plan->>'total_amount')::numeric,coalesce((_plan->>'residual_value')::numeric,0),(_plan->>'start_date')::date,(_plan->>'end_date')::date,coalesce((_plan->>'opening_settled')::numeric,0),nullif(_plan->>'stop_date','')::date,nullif(_plan->>'disposal_date','')::date,nullif(_plan->>'disposal_transaction_id','')::uuid,nullif(_plan->>'balance_account_id','')::uuid,links,coalesce((_plan->>'opening_escrow')::numeric,0),coalesce(_plan->'escrow_charges','[]'))
 on conflict(id) do update set account_id=excluded.account_id,name=excluded.name,kind=excluded.kind,category=excluded.category,total_amount=excluded.total_amount,residual_value=excluded.residual_value,start_date=excluded.start_date,end_date=excluded.end_date,opening_settled=excluded.opening_settled,stop_date=excluded.stop_date,disposal_date=excluded.disposal_date,disposal_transaction_id=excluded.disposal_transaction_id,balance_account_id=excluded.balance_account_id,payments=excluded.payments,opening_escrow=excluded.opening_escrow,escrow_charges=excluded.escrow_charges,is_void=false,updated_at=clock_timestamp();
 return i;end;$$;

commit;