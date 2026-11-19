begin;
alter table finance_cash_plans add column discovery_key text;
alter table finance_cash_plans add column discovery_evidence jsonb;
alter table finance_cash_plans add constraint cash_discovery_unique unique(owner_id,discovery_key);

-- Every plan writer shares this lock with acceptance, including ordinary edits.
create function finance_cash_plan_discovery_guard() returns trigger language plpgsql set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text||':cash-plans',0));
 if tg_op='UPDATE' and (new.discovery_key is distinct from old.discovery_key or new.discovery_evidence is distinct from old.discovery_evidence) then raise exception 'Discovery evidence is immutable';end if;
 return new;
end;$$;
create trigger cash_plan_00_discovery_guard before insert or update on finance_cash_plans for each row execute function finance_cash_plan_discovery_guard();

-- Atomic batch, guarded against a second browser saving plans during review.
create or replace function finance_accept_cash_suggestions(_plans jsonb,_expected jsonb) returns integer language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();current_versions jsonb;item jsonb;n integer:=0;begin
 if u is null then raise exception 'Sign in first';end if;
 if jsonb_typeof(_plans) is distinct from 'array' or jsonb_array_length(_plans) not between 1 and 100 then raise exception 'Choose 1 to 100 suggestions';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||':cash-plans',0));
 select coalesce(jsonb_object_agg(id::text,revision),'{}'::jsonb) into current_versions from finance_cash_plans where owner_id=u;
 if current_versions is distinct from _expected then raise exception 'Cash plans changed. Reload and review suggestions again';end if;
 for item in select value from jsonb_array_elements(_plans) loop
  if length(coalesce(item->>'key','')) not between 1 and 500 or jsonb_typeof(item->'evidence') is distinct from 'array' or jsonb_array_length(item->'evidence')<3 then raise exception 'Transaction evidence is required';end if;
  if exists(select 1 from jsonb_array_elements_text(item->'evidence') e(id) where not exists(select 1 from transactions t where t.id::text=e.id and t.user_id=u and not coalesce(t.pending,false))) then raise exception 'Transaction evidence unavailable';end if;
  -- Browser validation uses the person's local tomorrow; UTC may be one day ahead.
  if (item->>'first_date')::date<current_date then raise exception 'Choose a future cash date';end if;
  insert into finance_cash_plans(owner_id,account_id,name,amount,first_date,frequency,status,discovery_key,discovery_evidence)
   values(u,(item->>'account_id')::uuid,item->>'name',(item->>'amount')::numeric,(item->>'first_date')::date,item->>'frequency','active',item->>'key',jsonb_build_object('transactionIds',item->'evidence','lastPostedDate',item->>'last_date','kind',item->>'kind','acceptedAt',clock_timestamp()));
  n:=n+1;
 end loop;return n;
end;$$;
revoke all on function finance_accept_cash_suggestions(jsonb,jsonb) from public,anon;
grant execute on function finance_accept_cash_suggestions(jsonb,jsonb) to authenticated;
commit;
