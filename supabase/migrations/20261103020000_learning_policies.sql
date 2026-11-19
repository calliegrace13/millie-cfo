begin;
create table finance_learning_state(owner_id uuid primary key references auth.users(id),revision integer not null default 0);
create table finance_learning_policies(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),revision integer not null default 1,
 title text not null check(length(trim(title)) between 1 and 120),guidance text not null check(length(trim(guidance)) between 1 and 2000),
 module text not null default 'all' check(module='all' or cardinality(finance_ai_task_keys(module))>0),
 effect text not null check(effect in('expense_now','spread_service','asset_review','refundable_deposit','ask','guidance')),
 merchant text not null default '' check(length(merchant)<=100),category text not null default '' check(length(category)<=100),
 account_id uuid references accounts(id),currency text not null default 'USD' check(currency ~ '^[A-Z]{3}$'),
 min_amount numeric not null default 0 check(min_amount>=0 and min_amount<1e9),max_amount numeric check(max_amount>=min_amount and max_amount<1e9),
 starts_on date not null,ends_on date check(ends_on>=starts_on),enabled boolean not null default true,
 source_item_id uuid references finance_assistant_items(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(effect='guidance' or module='all')
);
create table finance_learning_history(id uuid primary key default gen_random_uuid(),owner_id uuid not null,policy_id uuid not null,revision integer not null,payload jsonb not null,recorded_at timestamptz not null default now());
alter table finance_learning_state enable row level security;alter table finance_learning_policies enable row level security;alter table finance_learning_history enable row level security;
revoke all on finance_learning_state,finance_learning_policies,finance_learning_history from public,anon,authenticated,service_role;
grant select on finance_learning_state,finance_learning_policies,finance_learning_history to authenticated,service_role;
create policy learning_state_own on finance_learning_state for select to authenticated using(owner_id=auth.uid());
create policy learning_policy_own on finance_learning_policies for select to authenticated using(owner_id=auth.uid());
create policy learning_history_own on finance_learning_history for select to authenticated using(owner_id=auth.uid());
create function finance_save_learning_policy(_id uuid,_expected integer,_value jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid();p finance_learning_policies;r finance_learning_policies;begin
 if u is null then raise exception 'Sign in first';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 perform pg_advisory_xact_lock(hashtextextended('learning:'||u::text,0));
 if _id is not null then
  select * into p from finance_learning_policies where id=_id and owner_id=u for update;
  if not found or p.revision is distinct from _expected then raise exception 'This policy changed. Refresh before saving';end if;
 elsif _expected is distinct from 0 then raise exception 'Invalid new policy revision';end if;
 if _id is null and (select count(*) from finance_learning_policies where owner_id=u)>=100 then raise exception 'You can keep up to 100 policies. Edit an existing policy';end if;
 if nullif(_value->>'account_id','') is not null and not exists(select 1 from accounts where id=(_value->>'account_id')::uuid and user_id=u) then raise exception 'Choose an owned account';end if;
 if nullif(_value->>'source_item_id','') is not null and not exists(select 1 from finance_assistant_items where id=(_value->>'source_item_id')::uuid and owner_id=u and answer<>'') then raise exception 'Answer this question before teaching a policy';end if;
 insert into finance_learning_policies(id,owner_id,revision,title,guidance,module,effect,merchant,category,account_id,currency,min_amount,max_amount,starts_on,ends_on,enabled,source_item_id)
 values(coalesce(_id,gen_random_uuid()),u,coalesce(p.revision,0)+1,trim(_value->>'title'),trim(_value->>'guidance'),coalesce(_value->>'module','all'),_value->>'effect',trim(coalesce(_value->>'merchant','')),coalesce(_value->>'category',''),nullif(_value->>'account_id','')::uuid,_value->>'currency',(_value->>'min_amount')::numeric,nullif(_value->>'max_amount','')::numeric,(_value->>'starts_on')::date,nullif(_value->>'ends_on','')::date,(_value->>'enabled')::boolean,nullif(_value->>'source_item_id','')::uuid)
 on conflict(id) do update set revision=excluded.revision,title=excluded.title,guidance=excluded.guidance,module=excluded.module,effect=excluded.effect,merchant=excluded.merchant,category=excluded.category,account_id=excluded.account_id,currency=excluded.currency,min_amount=excluded.min_amount,max_amount=excluded.max_amount,starts_on=excluded.starts_on,ends_on=excluded.ends_on,enabled=excluded.enabled,source_item_id=excluded.source_item_id,updated_at=clock_timestamp() returning * into r;
 insert into finance_learning_history(owner_id,policy_id,revision,payload) values(u,r.id,r.revision,to_jsonb(r));
 insert into finance_learning_state(owner_id,revision) values(u,1) on conflict(owner_id) do update set revision=finance_learning_state.revision+1;
 return to_jsonb(r);
end;$$;
create function finance_policy_merchant(_name text) returns text language sql immutable set search_path=public,pg_temp as $$select trim(regexp_replace(lower(coalesce(_name,'')),'[^a-z0-9]+',' ','g'));$$;
-- Same deterministic scope as the shared evaluator. Category checks use the bank
-- record BEFORE applying an AI suggestion, so an AI cannot change its own scope.
create function finance_matching_policies(_owner uuid,_transaction uuid,_module text) returns setof finance_learning_policies language sql stable security definer set search_path=public,pg_temp as $$
 select p.* from finance_learning_policies p join transactions t on t.id=_transaction and t.user_id=p.owner_id join accounts a on a.id=t.account_id and a.user_id=p.owner_id
 where p.owner_id=_owner and p.enabled and (p.module='all' or p.module=_module) and t.date between p.starts_on and coalesce(p.ends_on,'9999-12-31')
 and (p.account_id is null or p.account_id=t.account_id) and p.currency=coalesce(a.currency,'USD') and t.amount>=p.min_amount and (p.max_amount is null or t.amount<=p.max_amount)
 and (p.category='' or p.category=t.category) and (p.merchant='' or position(' '||finance_policy_merchant(p.merchant)||' ' in ' '||finance_policy_merchant(coalesce(nullif(t.merchant_name,''),t.name))||' ')>0);
$$;
alter function finance_assistant_apply(uuid,integer,boolean) rename to finance_assistant_apply_before_learning;
create function finance_assistant_apply(_id uuid,_expected integer,_automatic boolean default false) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid();w finance_assistant_items;j finance_assistant_jobs;effects text[];effect text;begin
 if u is null then raise exception 'Sign in first';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 perform pg_advisory_xact_lock(hashtextextended('learning:'||u::text,0));
 select * into w from finance_assistant_items where id=_id and owner_id=u for update;
 if not found then raise exception 'Item unavailable';end if;
 if w.status='done' then return w.result;end if;
 select * into j from finance_assistant_jobs where id=w.job_id and owner_id=u;
 if coalesce((j.snapshot->>'learning_revision')::integer,0)<>coalesce((select revision from finance_learning_state where owner_id=u),0) then raise exception 'Your policies changed after this analysis. Run a fresh analysis or use the manual tools';end if;
 if exists(select 1 from jsonb_each_text(coalesce(j.snapshot->'answer_values','{}')) a left join finance_assistant_items i on i.id=a.key::uuid and i.owner_id=u where i.id is null or i.answer is distinct from a.value) then raise exception 'Your saved answers changed after this analysis. Use a fresh analysis';end if;
 if _automatic and w.kind in('category','plan') then
  select array_agg(distinct p.effect) into effects from finance_matching_policies(u,(w.payload->>'transaction_id')::uuid,w.module) p where p.effect<>'guidance';
  effect:=effects[1];
  if cardinality(effects)>1 or effect='ask' or (w.kind='category' and effect is not null and effect<>'expense_now') or (w.kind='plan' and (effect='expense_now' or effect='spread_service' and w.payload->>'plan_kind'<>'service' or effect='asset_review' and w.payload->>'plan_kind'<>'asset' or effect='refundable_deposit' and w.payload->>'plan_kind'<>'deposit')) then raise exception 'Your policy requires a decision before this automatic change';end if;
 end if;
 return finance_assistant_apply_before_learning(_id,_expected,_automatic);
end;$$;
alter function finance_ai_apply_receipts(jsonb) rename to finance_ai_apply_receipts_before_learning;
create function finance_ai_apply_receipts(_purchases jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid();x jsonb;begin
 if u is null then raise exception 'Sign in first';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 perform pg_advisory_xact_lock(hashtextextended('learning:'||u::text,0));
 for x in select value from jsonb_array_elements(_purchases) loop
  if exists(select 1 from finance_matching_policies(u,(x->'expected'->>'id')::uuid,'transactions') where effect not in('expense_now','guidance')) then raise exception 'Your policy requires a timing or personal decision. Review this receipt in the manual workflow';end if;
 end loop;
 return finance_ai_apply_receipts_before_learning(_purchases);
end;$$;
-- Persist one-off answers in the existing versioned work record; policies require
-- a separate explicit owner save. The worker cannot create or expand policies.
alter function finance_assistant_update(uuid,integer,text,jsonb) rename to finance_assistant_update_before_learning;
create function finance_assistant_update(_id uuid,_expected integer,_action text,_value jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid();w finance_assistant_items;begin
 if u is null then raise exception 'Sign in first';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if _action<>'answer' then return finance_assistant_update_before_learning(_id,_expected,_action,_value);end if;
 select * into w from finance_assistant_items where id=_id and owner_id=u for update;
 if not found or w.revision is distinct from _expected then raise exception 'This question changed. Refresh before saving';end if;
 if w.kind<>'question' or w.status not in('needs_input','done') or coalesce(length(trim(_value->>'answer')),0) not between 1 and 4000 then raise exception 'Enter an answer to this question';end if;
 insert into finance_assistant_history(owner_id,item_id,revision,action,payload) values(u,w.id,w.revision,'answer',to_jsonb(w));
 update finance_assistant_items set answer=trim(_value->>'answer'),status='needs_input',revision=revision+1,updated_at=clock_timestamp() where id=_id returning * into w;
 return to_jsonb(w);
end;$$;
revoke all on function finance_assistant_update_before_learning(uuid,integer,text,jsonb),finance_assistant_update(uuid,integer,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function finance_assistant_update(uuid,integer,text,jsonb) to authenticated;
revoke all on function finance_save_learning_policy(uuid,integer,jsonb),finance_policy_merchant(text),finance_matching_policies(uuid,uuid,text),finance_assistant_apply_before_learning(uuid,integer,boolean),finance_ai_apply_receipts_before_learning(jsonb),finance_assistant_apply(uuid,integer,boolean),finance_ai_apply_receipts(jsonb) from public,anon,authenticated,service_role;
grant execute on function finance_save_learning_policy(uuid,integer,jsonb),finance_assistant_apply(uuid,integer,boolean),finance_ai_apply_receipts(jsonb) to authenticated;
commit;
