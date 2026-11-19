begin;
-- Private workflow state only. This orchestrator does not write financial records.
create table public.finance_setup_progress(
 owner_id uuid primary key,status text not null default 'not_started' check(status in('not_started','active','paused','finished')),
 required boolean not null default true,choice_confirmed boolean not null default false,checks text[] not null default '{}',deferred text[] not null default '{}',
 revision integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
-- Existing users get an optional guide, never a surprise onboarding redirect.
insert into public.finance_setup_progress(owner_id,required) select id,false from auth.users;
create table public.finance_setup_history(id uuid primary key default gen_random_uuid(),owner_id uuid not null,revision integer not null,action text not null,step_key text,after_value jsonb not null,recorded_at timestamptz not null default clock_timestamp(),unique(owner_id,revision));
alter table public.finance_setup_progress enable row level security;
alter table public.finance_setup_history enable row level security;
create policy setup_progress_own on public.finance_setup_progress for select to authenticated using(owner_id=auth.uid());
create policy setup_history_own on public.finance_setup_history for select to authenticated using(owner_id=auth.uid());
revoke all on public.finance_setup_progress,public.finance_setup_history from public,anon,authenticated;
grant select on public.finance_setup_progress,public.finance_setup_history to authenticated;
grant all on public.finance_setup_progress,public.finance_setup_history to service_role;

create function public.finance_get_setup() returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();r public.finance_setup_progress;begin
 if u is null then raise exception 'Sign in first';end if;
 insert into public.finance_setup_progress(owner_id) values(u) on conflict(owner_id) do nothing;
 select * into strict r from public.finance_setup_progress where owner_id=u;return to_jsonb(r);
end;$$;

create function public.finance_update_setup(_action text,_key text,_value boolean,_expected integer) returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();r public.finance_setup_progress;known jsonb:='{"foundation":["accounts","transactions","scope"],"household":["timeline","shares","access"],"everyday":["budget","bills","variance"],"income":["paystub","deposits","mix"],"assets":["inventory","recognition","bridge"],"analyst":["basis","statements","drivers"],"goals":["target","funding","actuals"],"runway":["patterns","coverage","liquidity"],"debt":["terms","payment","compare"],"investments":["holdings","reconcile","returns"],"longterm":["snapshot","assumptions","sensitivity"],"close":["quarter","exceptions","hold"],"rewards":["cards","benefits","usage"]}';module_id text;step_id text;enabled text[];keys text[];
begin
 if u is null then raise exception 'Sign in first';end if;
 select * into r from public.finance_setup_progress where owner_id=u for update;
 if not found or _expected is null or r.revision<>_expected then raise exception 'Setup changed on another device. Reload your saved progress before continuing';end if;
 if _action='start' then r.status:='active';
 elsif _action='pause' then r.status:='paused';
 elsif _action='choose' then
  if not exists(select 1 from public.finance_module_preferences where owner_id=u) then raise exception 'Save your module choices first';end if;
  r.choice_confirmed:=true;r.status:='active';
 elsif _action='check' then
  module_id:=split_part(_key,'.',1);step_id:=split_part(_key,'.',2);
  if _key is null or _key<>module_id||'.'||step_id or not coalesce(known->module_id ? step_id,false) or _value is null then raise exception 'Unknown setup step';end if;
  if not r.choice_confirmed then raise exception 'Choose your modules first';end if;
  if _value then if not(_key=any(r.checks)) then r.checks:=array_append(r.checks,_key);end if;r.deferred:=array_remove(r.deferred,module_id);
  else r.checks:=array_remove(r.checks,_key);end if;r.status:='active';
 elsif _action in('defer','resume') then
  if _key is null or not(known ? _key) then raise exception 'Unknown setup module';end if;
  if _action='defer' then if not(_key=any(r.deferred)) then r.deferred:=array_append(r.deferred,_key);end if;
  else r.deferred:=array_remove(r.deferred,_key);end if;r.status:='active';
 elsif _action='finish' then
  if not r.choice_confirmed then raise exception 'Choose your modules first';end if;
  select enabled_modules into enabled from public.finance_module_preferences where owner_id=u;
  if not found then raise exception 'Save your module choices first';end if;
  for module_id in select k from jsonb_object_keys(known) k where k='foundation' or k=any(enabled) loop
   select array_agg(module_id||'.'||value) into keys from jsonb_array_elements_text(known->module_id);
   if not(module_id=any(r.deferred)) and not(keys<@r.checks) then raise exception 'Review or defer the remaining setup modules first';end if;
  end loop;r.status:='finished';
 else raise exception 'Unknown setup action';end if;
 update public.finance_setup_progress set status=r.status,choice_confirmed=r.choice_confirmed,checks=r.checks,deferred=r.deferred,revision=revision+1,updated_at=clock_timestamp() where owner_id=u returning * into r;
 insert into public.finance_setup_history(owner_id,revision,action,step_key,after_value) values(u,r.revision,_action,_key,to_jsonb(r));return to_jsonb(r);
end;$$;
revoke all on function public.finance_get_setup(),public.finance_update_setup(text,text,boolean,integer) from public,anon;
grant execute on function public.finance_get_setup(),public.finance_update_setup(text,text,boolean,integer) to authenticated;
comment on table public.finance_setup_progress is 'Private resumable setup checklist, not proof of financial reconciliation. Does not change module preferences, transactions, bank connections, household access or closed periods.';
commit;
