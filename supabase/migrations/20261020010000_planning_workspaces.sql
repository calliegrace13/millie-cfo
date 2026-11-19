begin;
alter table finance_module_preferences drop constraint finance_modules_known;
-- Preserve access to old tools when splitting modules; never touch the ledger.
update finance_module_preferences set enabled_modules=(select array_agg(distinct v) from unnest(enabled_modules||case when 'everyday'=any(enabled_modules) then array['runway','rewards'] else '{}'::text[] end||case when 'analyst'=any(enabled_modules) then array['goals'] else '{}'::text[] end||case when 'investments'=any(enabled_modules) then array['assets'] else '{}'::text[] end) v where v<>'investments') where cardinality(enabled_modules)>0;
alter table finance_module_preferences alter column enabled_modules set default array['everyday','runway','goals','household','analyst','close','assets','rewards']::text[];
alter table finance_module_preferences add constraint finance_modules_known check(enabled_modules<@array['everyday','runway','goals','household','analyst','close','assets','rewards']::text[] and array_position(enabled_modules,null) is null and cardinality(enabled_modules)<=8);

create table finance_cash_plans(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid(),account_id uuid not null references accounts(id) on delete restrict,
 name text not null check(length(trim(name)) between 1 and 150),amount numeric not null check(amount<>0 and abs(amount)<1000000000),
 first_date date not null check(isfinite(first_date) and first_date>='1900-01-01'),frequency text not null check(frequency in('once','weekly','biweekly','monthly','quarterly','yearly')),
 end_date date check(isfinite(end_date) and end_date>=first_date),status text not null default 'active' check(status in('active','paused','archived')),
 recurring_id uuid references recurring_transactions(id) on delete restrict,project_id uuid references finance_documents(id) on delete restrict,
 revision integer not null default 1,created_at timestamptz not null default now(),
 check(recurring_id is null or project_id is null),unique(owner_id,recurring_id),unique(owner_id,project_id)
);
alter table finance_cash_plans enable row level security;
revoke all on finance_cash_plans from public,anon,authenticated;grant select,insert,update on finance_cash_plans to authenticated;grant all on finance_cash_plans to service_role;
create policy cash_plans_own on finance_cash_plans to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create table finance_cash_settings(owner_id uuid not null default auth.uid(),currency text not null check(currency~'^[A-Z]{3}$'),buffer numeric not null default 0 check(buffer>=0 and buffer<1000000000),variable_monthly numeric not null default 0 check(variable_monthly>=0 and variable_monthly<1000000000),primary key(owner_id,currency));
alter table finance_cash_settings enable row level security;
revoke all on finance_cash_settings from public,anon,authenticated;grant select,insert,update on finance_cash_settings to authenticated;grant all on finance_cash_settings to service_role;
create policy cash_settings_own on finance_cash_settings to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create table finance_plan_history(id uuid primary key default gen_random_uuid(),owner_id uuid not null,record_id uuid not null,record_type text not null,operation text not null,before_value jsonb,after_value jsonb,recorded_at timestamptz not null default clock_timestamp());
alter table finance_plan_history enable row level security;
revoke all on finance_plan_history from public,anon,authenticated;grant select on finance_plan_history to authenticated;grant all on finance_plan_history to service_role;
create policy plan_history_own on finance_plan_history for select to authenticated using(owner_id=auth.uid());
create function finance_plan_audit() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_table_name='finance_documents' then if coalesce(new.kind,old.kind) not in('goal','project') then return null;end if;end if;
 insert into finance_plan_history(owner_id,record_id,record_type,operation,before_value,after_value) values(coalesce(new.owner_id,old.owner_id),coalesce(new.id,old.id),tg_table_name,tg_op,case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);return null;
end;$$;
create function finance_cash_plan_guard() returns trigger language plpgsql security definer set search_path=public as $$
declare a accounts;begin
 if tg_op='UPDATE' and (new.owner_id<>old.owner_id or new.id<>old.id) then raise exception 'Plan identity cannot change';end if;
 select * into a from accounts where id=new.account_id and user_id=new.owner_id and (not coalesce(is_deleted,false) or new.status<>'active');
 if not found or a.type not in('checking','savings','depository') then raise exception 'Choose your active cash account';end if;
 if exists(select 1 from finance_account_sharing where account_id=a.id and duplicate_of is not null) or exists(select 1 from finance_account_continuity where source_id=a.id) then raise exception 'Choose the original primary cash account';end if;
 if new.recurring_id is not null and not exists(select 1 from recurring_transactions where id=new.recurring_id and user_id=new.owner_id) then raise exception 'Recurring record unavailable';end if;
 if new.project_id is not null and not exists(select 1 from finance_documents where id=new.project_id and owner_id=new.owner_id and kind='project' and payload->>'currency'=coalesce(a.currency,'USD')) then raise exception 'Choose your project in the same currency';end if;
 if tg_op='UPDATE' then new.revision:=old.revision+1;else new.revision:=1;end if;return new;
end;$$;
create trigger cash_plan_guard before insert or update on finance_cash_plans for each row execute function finance_cash_plan_guard();
create trigger cash_plan_audit after insert or update on finance_cash_plans for each row execute function finance_plan_audit();
create function finance_plan_document_guard() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='DELETE' and old.kind in('goal','project') then raise exception 'Archive this plan to preserve its history';end if;
 if tg_op='UPDATE' and (old.kind in('goal','project') or new.kind in('goal','project')) then
  if old.kind<>new.kind or old.id<>new.id or old.owner_id<>new.owner_id then raise exception 'Plan identity cannot change';end if;
  new.updated_at:=clock_timestamp();
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
create trigger plan_document_guard before update or delete on finance_documents for each row execute function finance_plan_document_guard();
create trigger plan_document_audit after insert or update on finance_documents for each row execute function finance_plan_audit();
-- Seed the audit with existing plans; original document IDs and payloads stay intact.
insert into finance_plan_history(owner_id,record_id,record_type,operation,after_value) select owner_id,id,'finance_documents','BASELINE',to_jsonb(d) from finance_documents d where kind in('goal','project');

create function finance_save_goal(_id uuid,_account uuid,_name text,_reserved numeric,_target numeric,_deadline date,_expected timestamptz default null,_archive boolean default false) returns uuid language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();a accounts;g finance_documents;pct numeric;used numeric;result uuid;begin
 if u is null then raise exception 'Sign in first';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||':goals',0));
 if _id is not null then select * into g from finance_documents where id=_id and owner_id=u and kind='goal' for update;
  if not found or _expected is null or g.updated_at<>_expected then raise exception 'This goal changed. Reload before saving';end if;
 end if;
 if _archive then
  if _id is null then raise exception 'Choose an existing goal';end if;
  update finance_documents set payload=jsonb_set(jsonb_set(payload,'{status}','"archived"'),'{reserved}','0'),updated_at=clock_timestamp() where id=_id;return _id;
 end if;
 select * into a from accounts where id=_account and user_id=u and not coalesce(is_deleted,false) for update;
 if not found or a.type not in('checking','savings','depository') or _reserved is null or _target is null or _reserved<0 or _target<=0 or _reserved>_target or greatest(abs(_reserved),abs(_target))>=1000000000 or length(trim(coalesce(_name,''))) not between 1 and 150 or (_deadline is not null and (not isfinite(_deadline) or _deadline<'1900-01-01')) then raise exception 'Choose your cash account, name and valid goal amounts';end if;
 if exists(select 1 from finance_account_sharing where account_id=a.id and duplicate_of is not null) or exists(select 1 from finance_account_continuity where source_id=a.id) then raise exception 'Use the original primary cash account';end if;
 select coalesce(balance_pct,owner_pct) into pct from finance_allocations where account_id=a.id and effective_from<=current_date order by effective_from desc limit 1;
 select coalesce(sum((payload->>'reserved')::numeric),0) into used from finance_documents where owner_id=u and kind='goal' and payload->>'accountId'=a.id::text and payload->>'status' is distinct from 'archived' and (_id is null or id<>_id);
 if used+_reserved>greatest(0,case when a.is_zero_balance then 0 else coalesce(a.current_balance,0) end)*coalesce(pct,100)/100 then raise exception 'Reservations exceed your current balance share';end if;
 if _id is null then insert into finance_documents(owner_id,kind,name,payload) values(u,'goal',trim(_name),jsonb_build_object('accountId',a.id,'currency',coalesce(a.currency,'USD'),'reserved',_reserved,'target',_target,'deadline',_deadline,'status','active')) returning id into result;
 else update finance_documents set name=trim(_name),payload=g.payload||jsonb_build_object('accountId',a.id,'currency',coalesce(a.currency,'USD'),'reserved',_reserved,'target',_target,'deadline',_deadline,'status','active'),updated_at=clock_timestamp() where id=_id returning id into result;end if;return result;
end;$$;
create or replace function finance_reserve_goal(_account uuid,_name text,_reserved numeric,_target numeric,_deadline date default null) returns uuid language sql security definer set search_path=public as $$select finance_save_goal(null,_account,_name,_reserved,_target,_deadline);$$;
revoke all on function finance_save_goal(uuid,uuid,text,numeric,numeric,date,timestamptz,boolean) from public,anon;grant execute on function finance_save_goal(uuid,uuid,text,numeric,numeric,date,timestamptz,boolean) to authenticated;
comment on table finance_cash_plans is 'Private expected cash movements only; never posts transactions or modifies financial statements. Revision history is append-only.';
commit;
