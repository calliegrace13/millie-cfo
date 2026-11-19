begin;
alter table finance_cash_settings add column spending_account uuid references accounts(id) on delete restrict,add column id uuid not null default gen_random_uuid() unique;
create function finance_cash_settings_guard() returns trigger language plpgsql security definer set search_path=public as $$
declare a accounts;begin
 if tg_op='UPDATE' and (new.owner_id<>old.owner_id or new.currency<>old.currency or new.id<>old.id) then raise exception 'Settings identity cannot change';end if;
 if new.spending_account is not null then
  a:=finance_planning_cash_account(new.spending_account,new.owner_id);
  if coalesce(a.currency,'USD')<>new.currency or exists(select 1 from finance_account_continuity where source_id=a.id) or exists(select 1 from finance_account_sharing where account_id=a.id and duplicate_of is not null) then raise exception 'Choose your primary cash account in this currency';end if;
 end if;return new;
end;$$;
create trigger cash_settings_guard before insert or update on finance_cash_settings for each row execute function finance_cash_settings_guard();
create trigger cash_settings_audit after insert or update on finance_cash_settings for each row execute function finance_plan_audit();
create function finance_keep_cash_plan() returns trigger language plpgsql as $$begin raise exception 'Archive cash plans to retain their revision history';end;$$;
create trigger keep_cash_plan before delete on finance_cash_plans for each row execute function finance_keep_cash_plan();
commit;
