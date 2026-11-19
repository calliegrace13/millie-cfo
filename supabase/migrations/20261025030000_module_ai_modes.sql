begin;
create function finance_ai_task_keys(_module text) returns text[] language sql immutable set search_path=public as $$
 select case _module when 'transactions' then array['categories','receipts','patterns'] when 'everyday' then array['budget'] when 'goals' then array['plan'] when 'assets' then array['timing'] when 'runway' then array['review'] when 'analyst' then array['review'] when 'household' then array['review'] when 'close' then array['review'] when 'rewards' then array['review'] when 'income' then array['review'] when 'investments' then array['review'] when 'debt' then array['review'] when 'longterm' then array['review'] when 'watchlists' then array['review'] when 'recoveries' then array['review'] else '{}'::text[] end;
$$;
create table finance_ai_policies(owner_id uuid not null references auth.users(id),module text not null,mode text not null default 'manual' check(mode in('manual','ai')),tasks text[] not null default '{}',auto_tasks text[] not null default '{}',use_receipts boolean not null default false,use_web boolean not null default false,revision integer not null default 1,updated_at timestamptz not null default now(),primary key(owner_id,module),check(cardinality(finance_ai_task_keys(module))>0 and tasks<@finance_ai_task_keys(module) and auto_tasks<@tasks and array_position(tasks,null) is null and array_position(auto_tasks,null) is null),check(auto_tasks<@case module when 'transactions' then array['categories','receipts'] when 'assets' then array['timing'] else '{}'::text[] end));
create table finance_ai_policy_history(id uuid primary key default gen_random_uuid(),owner_id uuid not null,module text not null,revision integer not null,payload jsonb not null,recorded_at timestamptz not null default now());
create table finance_assistant_jobs(id uuid primary key,owner_id uuid not null references auth.users(id),module text not null,task text not null,policy_revision integer not null,context_cipher text not null,snapshot jsonb not null default '{}',status text not null default 'prepared' check(status in('prepared','finished')),summary text not null default '',created_at timestamptz not null default now());
create table finance_assistant_items(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),job_id uuid not null references finance_assistant_jobs(id),module text not null,task text not null,fingerprint text not null,kind text not null check(kind in('question','insight','category','plan','budget','goal')),payload jsonb not null,status text not null check(status in('needs_input','ready','done','dismissed')),answer text not null default '',result jsonb,revision integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner_id,fingerprint));
create index assistant_inbox on finance_assistant_items(owner_id,status,created_at desc);
create table finance_assistant_history(id uuid primary key default gen_random_uuid(),owner_id uuid not null,item_id uuid not null,revision integer not null,action text not null,payload jsonb not null,recorded_at timestamptz not null default now());
alter table finance_ai_policies enable row level security;alter table finance_ai_policy_history enable row level security;alter table finance_assistant_jobs enable row level security;alter table finance_assistant_items enable row level security;alter table finance_assistant_history enable row level security;
revoke all on finance_ai_policies,finance_ai_policy_history,finance_assistant_jobs,finance_assistant_items,finance_assistant_history from public,anon,authenticated;
grant select on finance_ai_policies,finance_ai_policy_history,finance_assistant_items,finance_assistant_history to authenticated;
grant all on finance_ai_policies,finance_ai_policy_history,finance_assistant_jobs,finance_assistant_items,finance_assistant_history to service_role;
create policy ai_policies_own on finance_ai_policies for select to authenticated using(owner_id=auth.uid());
create policy ai_policy_history_own on finance_ai_policy_history for select to authenticated using(owner_id=auth.uid());
create policy assistant_items_own on finance_assistant_items for select to authenticated using(owner_id=auth.uid());
create policy assistant_history_own on finance_assistant_history for select to authenticated using(owner_id=auth.uid());
create function finance_set_ai_policy(_module text,_mode text,_tasks text[],_auto text[],_receipts boolean,_web boolean,_expected integer) returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();p finance_ai_policies;r finance_ai_policies;begin
 if u is null then raise exception 'Sign in first';end if;
 perform pg_advisory_xact_lock(hashtextextended('ai-policy:'||u::text,0));
 select * into p from finance_ai_policies where owner_id=u and module=_module for update;
 if coalesce(p.revision,0) is distinct from _expected then raise exception 'Your AI settings changed. Refresh before saving';end if;
 insert into finance_ai_policies(owner_id,module,mode,tasks,auto_tasks,use_receipts,use_web) values(u,_module,_mode,_tasks,_auto,_receipts,_web)
 on conflict(owner_id,module) do update set mode=excluded.mode,tasks=excluded.tasks,auto_tasks=excluded.auto_tasks,use_receipts=excluded.use_receipts,use_web=excluded.use_web,revision=finance_ai_policies.revision+1,updated_at=clock_timestamp() returning * into r;
 insert into finance_ai_policy_history(owner_id,module,revision,payload) values(u,_module,r.revision,to_jsonb(r));return to_jsonb(r);end;$$;
create function finance_ai_authorize_task(_owner uuid,_module text,_task text) returns jsonb language plpgsql security definer set search_path=public as $$
declare p finance_ai_policies;begin
 select * into p from finance_ai_policies where owner_id=_owner and module=_module;
 if p.mode is distinct from 'ai' or not (_task=any(p.tasks)) then raise exception 'AI is off for this task. Change it in Customize Millie';end if;
 if _module<>'transactions' and exists(select 1 from finance_module_preferences where owner_id=_owner and not(_module=any(enabled_modules))) then raise exception 'Enable this module before running AI';end if;
 return to_jsonb(p);end;$$;
create function finance_assistant_store(_job uuid,_items jsonb,_summary text) returns void language plpgsql security definer set search_path=public as $$
declare j finance_assistant_jobs;x jsonb;begin
 select * into j from finance_assistant_jobs where id=_job for update;if not found then raise exception 'Assistant job unavailable';end if;
 if j.status='finished' then return;end if;
 if jsonb_typeof(_items)<>'array' or jsonb_array_length(_items)>20 or length(_summary)>1800 then raise exception 'Invalid assistant response';end if;
 for x in select value from jsonb_array_elements(_items) loop
 insert into finance_assistant_items(owner_id,job_id,module,task,fingerprint,kind,payload,status)
 values(j.owner_id,j.id,j.module,j.task,x->>'fingerprint',x->>'kind',x->'payload',case x->>'kind' when 'question' then 'needs_input' when 'insight' then 'done' else 'ready' end) on conflict(owner_id,fingerprint) do nothing;
 end loop;
 update finance_assistant_jobs set status='finished',summary=_summary where id=j.id;end;$$;
create function finance_assistant_update(_id uuid,_expected integer,_action text,_value jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();w finance_assistant_items;begin
 if u is null then raise exception 'Sign in first';end if;
 select * into w from finance_assistant_items where id=_id and owner_id=u for update;
 if not found or w.revision<>_expected then raise exception 'This item changed. Refresh before saving';end if;
 if _action='answer' and w.kind='question' and w.status='needs_input' and length(trim(_value->>'answer')) between 1 and 4000 then
  update finance_assistant_items set answer=trim(_value->>'answer'),revision=revision+1,updated_at=clock_timestamp() where id=_id;
 elsif _action='dismiss' and w.status in('ready','needs_input') then
  update finance_assistant_items set status='dismissed',revision=revision+1,updated_at=clock_timestamp() where id=_id;
 elsif _action='done' and w.kind='question' and w.status='needs_input' then
  update finance_assistant_items set status='done',revision=revision+1,updated_at=clock_timestamp() where id=_id;
 elsif _action='edit' and w.status='ready' then
  if exists(select 1 from jsonb_object_keys(_value) k where k not in('category','name','start_date','end_date','amount','residual')) then raise exception 'Unsupported edit';end if;
  update finance_assistant_items set payload=payload||_value,revision=revision+1,updated_at=clock_timestamp() where id=_id;
 else raise exception 'Choose an available item action';end if;
 insert into finance_assistant_history(owner_id,item_id,revision,action,payload) values(u,w.id,w.revision,_action,to_jsonb(w));
 select * into w from finance_assistant_items where id=_id;return to_jsonb(w);end;$$;
create function finance_assistant_apply(_id uuid,_expected integer,_automatic boolean default false) returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();w finance_assistant_items;j finance_assistant_jobs;p finance_ai_policies;t transactions;x jsonb;result_id uuid;apply_result jsonb;old_budget jsonb;begin
 if u is null then raise exception 'Sign in first';end if;
 -- Same owner lock as ledger review and period closes: no split financial commits.
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 perform pg_advisory_xact_lock(hashtextextended('ai-policy:'||u::text,0));
 select * into w from finance_assistant_items where id=_id and owner_id=u for update;
 if not found then raise exception 'Item unavailable';end if;
 if w.status='done' then return w.result;end if;
 if w.revision<>_expected or w.status<>'ready' then raise exception 'This item changed. Refresh before saving';end if;
 select * into j from finance_assistant_jobs where id=w.job_id and owner_id=u;
 if _automatic then
  select * into p from finance_ai_policies where owner_id=u and module=w.module;
  if p.mode is distinct from 'ai' or not(w.task=any(p.tasks)) or not(w.task=any(p.auto_tasks)) or p.revision<>j.policy_revision or w.revision<>1 or w.kind not in('category','plan') then raise exception 'Automatic saving is off or settings changed. Review this item';end if;
  perform finance_ai_authorize_task(u,w.module,w.task);
 end if;
 x:=w.payload;
 if w.kind in('category','plan') then
  select * into t from transactions where id=(x->>'transaction_id')::uuid and user_id=u for update;
  if not found then raise exception 'Purchase unavailable';end if;
  perform finance_save_merchant_review_batch('[]',jsonb_build_array(jsonb_build_object('category',x->>'category','expected',j.snapshot->'transactions'->t.id::text)));
  if w.kind='plan' then
   if x->>'plan_kind' not in('service','asset','deposit') or (x->>'amount')::numeric<>t.amount or (x->>'residual')::numeric<0 or (x->>'residual')::numeric>t.amount then raise exception 'Invalid timing proposal';end if;
   -- A new timing plan may not indirectly restate another closed period.
   if exists(select 1 from finance_documents d where d.owner_id=u and d.kind='close' and ((d.payload->'reviewScope'->'accountIds' ? t.account_id::text and (x->>'start_date')<=(d.payload->'reviewScope'->>'end') and (x->>'end_date')>=(d.payload->'reviewScope'->>'start')) or (d.payload->'reviewScope' is null and coalesce(d.payload->'options'->>'basis','')<>'proforma' and (x->>'start_date')<=coalesce(d.payload->'options'->>'end','9999-12-31') and (x->>'end_date')>=coalesce(d.payload->'options'->>'start','0001-01-01')))) then raise exception 'This timing plan overlaps a closed period. Use the manual correction workflow';end if;
   result_id:=finance_save_accounting_plan(jsonb_build_object('account_id',t.account_id,'name',x->>'name','kind',x->>'plan_kind','category',x->>'category','total_amount',t.amount,'residual_value',(x->>'residual')::numeric,'start_date',x->>'start_date','end_date',x->>'end_date','opening_settled',0,'payments',jsonb_build_array(jsonb_build_object('transaction_id',t.id,'interest',0))));
  end if;
 elsif w.kind='budget' then
  if w.module<>'everyday' or _automatic then raise exception 'Review budget targets before saving';end if;
  select to_jsonb(b) into old_budget from finance_budget_versions b where owner_id=u and category=x->>'category' and currency=x->>'currency' and view='mine' and effective_month<=(x->>'start_date')::date order by effective_month desc,created_at desc limit 1;
  if old_budget is not null and not exists(select 1 from jsonb_array_elements(j.snapshot->'budgets') b where b=old_budget) then raise exception 'This budget changed. Refresh before saving';end if;
  perform finance_save_budget(x->>'category','mine',x->>'currency',(x->>'start_date')::date,(x->>'amount')::numeric);
 elsif w.kind='goal' then
  if w.module<>'goals' or _automatic then raise exception 'Review your goal before saving';end if;
  if exists(select 1 from finance_documents where owner_id=u and kind='goal' and lower(name)=lower(x->>'name') and payload->>'status' is distinct from 'archived') then raise exception 'A goal with this name already exists. Edit it in Goals';end if;
  result_id:=finance_save_goal(null,(x->>'account_id')::uuid,x->>'name',0,(x->>'amount')::numeric,nullif(x->>'end_date','')::date);
 else raise exception 'This item has no supported financial action';end if;
 apply_result:=jsonb_build_object('kind',w.kind,'id',result_id,'automatic',_automatic);
 insert into finance_assistant_history(owner_id,item_id,revision,action,payload) values(u,w.id,w.revision,case when _automatic then 'auto_apply' else 'apply' end,to_jsonb(w));
 update finance_assistant_items set status='done',result=apply_result,revision=revision+1,updated_at=clock_timestamp() where id=w.id;
 return apply_result;end;$$;
revoke all on function finance_set_ai_policy(text,text,text[],text[],boolean,boolean,integer),finance_assistant_update(uuid,integer,text,jsonb),finance_assistant_apply(uuid,integer,boolean) from public,anon;
grant execute on function finance_set_ai_policy(text,text,text[],text[],boolean,boolean,integer),finance_assistant_update(uuid,integer,text,jsonb),finance_assistant_apply(uuid,integer,boolean) to authenticated;
revoke all on function finance_ai_authorize_task(uuid,text,text),finance_assistant_store(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function finance_ai_authorize_task(uuid,text,text),finance_assistant_store(uuid,jsonb,text) to service_role;
-- Existing explicitly connected receipt/pattern tools remain usable. New modules
-- start Manual, and no new automatic financial approval is enabled by migration.
insert into finance_ai_policies(owner_id,module,mode,tasks)
select owner_id,'transactions','ai',array['receipts','patterns'] from finance_ai_settings where active_provider is not null;
create function finance_ai_apply_receipts(_purchases jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();p finance_ai_policies;begin
 if u is null then raise exception 'Sign in first';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 perform pg_advisory_xact_lock(hashtextextended('ai-policy:'||u::text,0));
 select * into p from finance_ai_policies where owner_id=u and module='transactions';
 if p.mode is distinct from 'ai' or not('receipts'=any(p.tasks)) or not('receipts'=any(p.auto_tasks)) then raise exception 'Automatic receipt approval is off. Review suggestions or enable it in Customize Millie';end if;
 return finance_save_merchant_review_batch('[]',_purchases);end;$$;
revoke all on function finance_ai_apply_receipts(jsonb) from public,anon;grant execute on function finance_ai_apply_receipts(jsonb) to authenticated;
grant select(id,owner_id,module,task,status,summary,created_at) on finance_assistant_jobs to authenticated;
create policy assistant_jobs_own on finance_assistant_jobs for select to authenticated using(owner_id=auth.uid());
create function finance_set_ai_modes(_changes jsonb) returns void language plpgsql security definer set search_path=public as $$
declare x jsonb;begin
 if auth.uid() is null or jsonb_typeof(_changes) is distinct from 'array' or jsonb_array_length(_changes) not between 1 and 15 then raise exception 'Choose known modules';end if;
 for x in select value from jsonb_array_elements(_changes) loop
  perform finance_set_ai_policy(x->>'module',x->>'mode',array(select jsonb_array_elements_text(x->'tasks')),array(select jsonb_array_elements_text(x->'auto')),(x->>'receipts')::boolean,(x->>'web')::boolean,(x->>'expected')::integer);
 end loop;end;$$;
revoke all on function finance_set_ai_modes(jsonb) from public,anon;grant execute on function finance_set_ai_modes(jsonb) to authenticated;
commit;
