begin;
create table public.finance_accounting_plans(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),account_id uuid not null references accounts(id),
 name text not null check(length(name) between 1 and 150),kind text not null check(kind in ('service','lease','asset','deposit','loan','deferred_income')),
 category text not null,total_amount numeric not null check(total_amount>0 and total_amount<1000000000000),residual_value numeric not null default 0 check(residual_value>=0),
 start_date date not null,end_date date not null,opening_settled numeric not null default 0 check(opening_settled>=0 and opening_settled<1000000000000),stop_date date,
 disposal_date date,disposal_transaction_id uuid references transactions(id),balance_account_id uuid references accounts(id),payments jsonb not null default '[]',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(isfinite(start_date) and isfinite(end_date) and end_date>=start_date and end_date<=start_date+interval '100 years'),check(residual_value<=total_amount),check(disposal_date is null or (disposal_date>=start_date and kind in ('asset','deposit'))),check(stop_date is null or (stop_date>=start_date and kind in ('service','lease','deferred_income'))));
alter table finance_accounting_plans enable row level security;
create policy "Accounting owner or full-history recipient" on finance_accounting_plans for select to authenticated using(owner_id=auth.uid() or finance_can_read_account(account_id,start_date));
-- Writes use the validated RPC; a payment can be assigned to only one plan.
create table public.finance_accounting_plan_audit(id uuid primary key default gen_random_uuid(),owner_id uuid not null,payload jsonb not null,recorded_at timestamptz not null default now());
alter table finance_accounting_plan_audit enable row level security;
create policy "Private accounting revision history" on finance_accounting_plan_audit for select to authenticated using(owner_id=auth.uid());
create function finance_save_accounting_plan(_plan jsonb,_expected timestamptz default null) returns uuid language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();i uuid;old finance_accounting_plans;entry jsonb;t transactions;acct accounts;other accounts;links jsonb;kind text;interest numeric;ids uuid[]:='{}';begin
 if u is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 i:=coalesce(nullif(_plan->>'id','')::uuid,gen_random_uuid());
 select * into old from finance_accounting_plans where id=i for update;
 if old.id is not null and (old.owner_id<>u or old.updated_at is distinct from _expected) then raise exception 'Plan changed or unavailable';end if;
 select * into acct from accounts where id=(_plan->>'account_id')::uuid and user_id=u;
 if acct.id is null then raise exception 'Choose your account';end if;
 kind:=_plan->>'kind';links:=coalesce(_plan->'payments','[]');
 if jsonb_typeof(links)<>'array' or jsonb_array_length(links)>1000 then raise exception 'Invalid payments';end if;
 if nullif(_plan->>'balance_account_id','') is not null then
 select * into other from accounts where id=(_plan->>'balance_account_id')::uuid and user_id=u;
 if kind<>'loan' or other.id is null or other.type not in ('loan','credit') or coalesce(other.currency,'USD')<>coalesce(acct.currency,'USD') then raise exception 'Choose a matching tracked debt account';end if;end if;
 for entry in select * from jsonb_array_elements(links) loop
 select * into t from transactions where id=(entry->>'transaction_id')::uuid and user_id=u for update;
 interest:=coalesce((entry->>'interest')::numeric,0);
 if t.id is null or t.pending or t.account_id<>acct.id or (kind='loan' and t.date<(_plan->>'start_date')::date) or t.is_amortized then raise exception 'Choose posted payments from this account on or after the start date, without another schedule';end if;
 if t.id=any(ids) or exists(select 1 from finance_accounting_plans p,jsonb_array_elements(p.payments) l where p.id<>i and p.owner_id=u and l->>'transaction_id'=t.id::text) then raise exception 'Payment already assigned';end if;ids:=array_append(ids,t.id);
 if interest<0 or interest>abs(t.amount) or (kind<>'loan' and interest<>0) or (kind='loan' and t.amount<=0) then raise exception 'Invalid payment split';end if;
 if (t.linked_transfer_id is not null or lower(coalesce(t.category,'')) in ('transfer','credit card payment','settlement','reimbursement')) and kind<>'loan' then raise exception 'Internal transfers cannot fund this plan';end if;
 end loop;
 if nullif(_plan->>'disposal_transaction_id','') is not null then
 select * into t from transactions where id=(_plan->>'disposal_transaction_id')::uuid and user_id=u for update;
 if t.id is null or t.pending or t.amount>=0 or t.account_id<>acct.id or t.is_amortized or t.linked_transfer_id is not null or t.date::text is distinct from _plan->>'disposal_date' or t.id=any(ids) then raise exception 'Choose the posted disposal receipt on the disposal date';end if;
 if exists(select 1 from finance_accounting_plans p where p.id<>i and (p.disposal_transaction_id=t.id or exists(select 1 from jsonb_array_elements(p.payments) l where l->>'transaction_id'=t.id::text))) then raise exception 'Receipt already assigned';end if;
 end if;
 if exists(select 1 from finance_accounting_plans p where p.id<>i and p.disposal_transaction_id=any(ids)) then raise exception 'Payment already assigned to disposal';end if;
 update transactions set needs_review=false where user_id=u and (id=any(ids) or id=nullif(_plan->>'disposal_transaction_id','')::uuid);
 if old.id is not null then insert into finance_accounting_plan_audit(owner_id,payload) values(u,to_jsonb(old));end if;
 insert into finance_accounting_plans(id,owner_id,account_id,name,kind,category,total_amount,residual_value,start_date,end_date,opening_settled,stop_date,disposal_date,disposal_transaction_id,balance_account_id,payments)
 values(i,u,acct.id,trim(_plan->>'name'),kind,trim(_plan->>'category'),(_plan->>'total_amount')::numeric,coalesce((_plan->>'residual_value')::numeric,0),(_plan->>'start_date')::date,(_plan->>'end_date')::date,coalesce((_plan->>'opening_settled')::numeric,0),nullif(_plan->>'stop_date','')::date,nullif(_plan->>'disposal_date','')::date,nullif(_plan->>'disposal_transaction_id','')::uuid,nullif(_plan->>'balance_account_id','')::uuid,links)
 on conflict(id) do update set account_id=excluded.account_id,name=excluded.name,kind=excluded.kind,category=excluded.category,total_amount=excluded.total_amount,residual_value=excluded.residual_value,start_date=excluded.start_date,end_date=excluded.end_date,opening_settled=excluded.opening_settled,stop_date=excluded.stop_date,disposal_date=excluded.disposal_date,disposal_transaction_id=excluded.disposal_transaction_id,balance_account_id=excluded.balance_account_id,payments=excluded.payments,updated_at=clock_timestamp();
 return i;end;$$;
revoke all on function finance_save_accounting_plan(jsonb,timestamptz) from public,anon;
grant execute on function finance_save_accounting_plan(jsonb,timestamptz) to authenticated;
CREATE OR REPLACE FUNCTION finance_retain_shared(_account uuid,_recipient uuid,_from date) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE p jsonb; BEGIN
 IF _recipient IS NULL OR _from IS NULL THEN RETURN; END IF;
 SELECT jsonb_build_object('accounts',jsonb_build_array(to_jsonb(a)-'plaid_account_id'),'transactions',coalesce((SELECT jsonb_agg(to_jsonb(t)-'plaid_transaction_id') FROM transactions t WHERE account_id=a.id AND date>=_from),'[]'::jsonb),'allocations',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM finance_allocations r WHERE account_id=a.id),'[]'::jsonb),'categorySplits',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM finance_category_splits r WHERE account_id=a.id),'[]'::jsonb),'observations',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM finance_balance_observations r WHERE account_id=a.id AND observed_on>=_from),'[]'::jsonb),'sharing',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM finance_account_sharing r WHERE account_id=a.id),'[]'::jsonb),'continuity',coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM finance_account_continuity c WHERE (original_id=a.id OR source_id=a.id) AND EXISTS(SELECT 1 FROM finance_account_sharing s WHERE s.account_id=c.original_id AND s.enabled AND s.recipient_id=_recipient) AND EXISTS(SELECT 1 FROM finance_account_sharing s WHERE s.account_id=c.source_id AND s.enabled AND s.recipient_id=_recipient)),'[]'::jsonb),'accountingPlans',coalesce((SELECT jsonb_agg(to_jsonb(ap)) FROM finance_accounting_plans ap WHERE ap.account_id=a.id AND ap.start_date>=_from),'[]'::jsonb),'budgets','[]'::jsonb,'historyFrom',_from,'retainedThrough',now()) INTO p FROM accounts a WHERE id=_account;
 IF p IS NOT NULL THEN INSERT INTO finance_retained_history(owner_id,account_id,payload) VALUES(_recipient,_account,p); END IF; END $$;

commit;
