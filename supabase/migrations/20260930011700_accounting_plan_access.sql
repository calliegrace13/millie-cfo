begin;
revoke all on finance_accounting_plans,finance_accounting_plan_audit from anon,authenticated;
grant select on finance_accounting_plans,finance_accounting_plan_audit to authenticated;
grant all on finance_accounting_plans,finance_accounting_plan_audit to service_role;
commit;
