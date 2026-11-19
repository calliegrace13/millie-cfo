begin;
create temp table module_test_users as select user_id u,partner_user_id p from partner_links where status='active' limit 1;
grant select on module_test_users to authenticated;
-- Fixtures and any overwritten preferences are rolled back at the end.
set local role authenticated;
do $$declare f record;blocked boolean;n integer;begin
 select * into strict f from module_test_users;
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claim.sub',f.u::text,true);
 insert into finance_module_preferences(owner_id,enabled_modules) values(f.u,array['everyday','household']) on conflict(owner_id) do update set enabled_modules=excluded.enabled_modules;
 if (select enabled_modules from finance_module_preferences where owner_id=f.u)<>array['everyday','household'] then raise exception 'Owner save failed';end if;
 update finance_module_preferences set enabled_modules='{}' where owner_id=f.u;
 if cardinality((select enabled_modules from finance_module_preferences where owner_id=f.u))<>0 then raise exception 'Core-only workspace failed';end if;
 blocked:=false;begin update finance_module_preferences set enabled_modules=array['invalid'] where owner_id=f.u;exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Unknown module accepted';end if;
 blocked:=false;begin update finance_module_preferences set enabled_modules=array[null]::text[] where owner_id=f.u;exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Null module accepted';end if;
 perform set_config('request.jwt.claim.sub',f.p::text,true);
 if exists(select 1 from finance_module_preferences where owner_id=f.u) then raise exception 'Partner read private preferences';end if;
 update finance_module_preferences set enabled_modules=array['analyst'] where owner_id=f.u;get diagnostics n=row_count;
 if n<>0 then raise exception 'Partner changed preferences';end if;
 blocked:=false;begin insert into finance_module_preferences(owner_id,enabled_modules) values(f.u,array['analyst']) on conflict(owner_id) do update set enabled_modules=excluded.enabled_modules;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Partner upsert allowed';end if;
end;$$;
reset role;
set local role anon;
do $$declare blocked boolean:=false;begin
 begin perform count(*) from finance_module_preferences;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Anonymous access allowed';end if;
end;$$;
reset role;
rollback;
select 'PASS: owner saves, empty workspace, invalid inputs, partner isolation and anonymous denial. Fixtures rolled back.' as result;
