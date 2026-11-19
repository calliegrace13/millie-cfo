begin;
-- Presentation preferences are deliberately independent of the financial ledger.
create table public.finance_module_preferences (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 enabled_modules text[] not null default array['everyday','analyst','household','close','assets','investments']::text[],
 constraint finance_modules_known check (
   enabled_modules <@ array['everyday','analyst','household','close','assets','investments']::text[]
   and array_position(enabled_modules,null) is null
   and cardinality(enabled_modules)<=6
 )
);
alter table public.finance_module_preferences enable row level security;
create policy modules_read_own on public.finance_module_preferences for select to authenticated using(owner_id=auth.uid());
create policy modules_insert_own on public.finance_module_preferences for insert to authenticated with check(owner_id=auth.uid());
create policy modules_update_own on public.finance_module_preferences for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
revoke all on public.finance_module_preferences from public,anon,authenticated;
grant select,insert,update on public.finance_module_preferences to authenticated;
comment on table public.finance_module_preferences is 'Per-user presentation only. Never affects bank sync, ledger calculations, close records, household allocations or partner permissions.';
commit;
