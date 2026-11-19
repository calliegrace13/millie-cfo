begin;
create temp table mr as select user_id u,partner_user_id p,gen_random_uuid() a,gen_random_uuid() x,gen_random_uuid() y,gen_random_uuid() z from partner_links where status='active' limit 1;
grant select on mr to authenticated;
delete from finance_merchant_preferences where owner_id in(select u from mr) and merchant_key='service:uber-rides';
insert into accounts(id,user_id,name,type,currency) select a,u,'Routine validation fixture','credit','USD' from mr;
insert into transactions(id,user_id,account_id,name,merchant_name,date,amount,category,classification_source,needs_review) select x,u,a,'UBER TRIP','Uber',current_date,20,'Other','auto',true from mr union all select y,u,a,'UBER TRIP','Uber',current_date,300,'Other','auto',true from mr union all select z,u,a,'UBER EATS','Uber',current_date,20,'Other','auto',true from mr;
create function pg_temp.routine_expected(_id uuid) returns jsonb language sql as $$select jsonb_build_array(jsonb_build_object('id',t.id,'updated_at',t.updated_at,'amount',t.amount,'date',t.date,'account_id',t.account_id,'category',t.category)) from transactions t where id=_id$$;
set local role authenticated;
do $$declare f record;blocked boolean;n integer;expected jsonb;begin
 select * into strict f from mr;
 perform set_config('request.jwt.claim.role','authenticated',true);perform set_config('request.jwt.claim.sub',f.p::text,true);
 blocked:=false;begin perform finance_save_merchant_routine('service:uber-rides','Transportation','USD',90,pg_temp.routine_expected(f.x));exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Partner changed owner history';end if;
 perform set_config('request.jwt.claim.sub',f.u::text,true);
 blocked:=false;begin perform finance_save_merchant_routine('service:uber-rides','Transportation','USD',90,pg_temp.routine_expected(f.y));exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Large amount auto-approved';end if;
 blocked:=false;begin perform finance_save_merchant_routine('service:uber-rides','Transportation','USD',90,pg_temp.routine_expected(f.z));exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Uber Eats merged with rides';end if;
 blocked:=false;begin perform finance_save_merchant_routine('service:uber-rides','Income','USD',90,pg_temp.routine_expected(f.x));exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Income preference accepted';end if;
 expected:=pg_temp.routine_expected(f.x);n:=finance_save_merchant_routine('service:uber-rides','Transportation','USD',90,expected);
 if n<>1 or (select needs_review or category<>'Transportation' or not classification_locked from transactions where id=f.x) then raise exception 'Group did not approve correctly';end if;
 blocked:=false;begin perform finance_save_merchant_routine('service:uber-rides','Transportation','USD',90,expected);exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Stale preview accepted';end if;
end;$$;
reset role;
insert into finance_documents(owner_id,kind,name,payload) select u,'close','Routine held-period fixture',jsonb_build_object('reviewScope',jsonb_build_object('version',1,'ownerId',u,'start','1901-01-01','end','1901-03-31','accountIds',jsonb_build_array(a))) from mr;
insert into transactions(user_id,account_id,name,merchant_name,date,amount,category,classification_source,needs_review) select u,a,'UBER TRIP held','Uber','1901-01-15',25,'Other','auto',true from mr;
do $$begin
 if exists(select 1 from transactions where account_id in(select a from mr) and name='UBER TRIP held' and (not needs_review or category<>'Other')) then raise exception 'Closed period import auto-approved';end if;
end;$$;
-- Imported posted purchases skip review; exceptions do not.
insert into transactions(user_id,account_id,name,merchant_name,date,amount,category,classification_source,needs_review,pending)
select u,a,'UBER TRIP','Uber',current_date,25,'Other','auto',true,false from mr union all select u,a,'UBER TRIP large','Uber',current_date,500,'Other','auto',true,false from mr union all select u,a,'UBER TRIP refund','Uber',current_date,-25,'Other','auto',true,false from mr union all select u,a,'UBER TRIP pending','Uber',current_date,25,'Other','auto',true,true from mr;
do $$begin
 if exists(select 1 from transactions where account_id in(select a from mr) and name='UBER TRIP' and amount=25 and (needs_review or category<>'Transportation')) then raise exception 'Routine import not approved';end if;
 if exists(select 1 from transactions where account_id in(select a from mr) and name in('UBER TRIP large','UBER TRIP refund','UBER TRIP pending') and not needs_review) then raise exception 'Exception cleared';end if;
end;$$;
set local role authenticated;
do $$declare f record;pref uuid;begin
 select * into strict f from mr;perform set_config('request.jwt.claim.role','authenticated',true);perform set_config('request.jwt.claim.sub',f.u::text,true);
 select id into pref from finance_merchant_preferences where owner_id=f.u and merchant_key='service:uber-rides';perform finance_pause_merchant_routine(pref);
 if (select auto_approve from finance_merchant_preferences where id=pref) then raise exception 'Pause failed';end if;
 if (select needs_review from transactions where id=f.x) then raise exception 'Pause rewrote approved history';end if;
end;$$;
reset role;
rollback;
select 'PASS: owner isolation, amount limit, service separation, stale previews, imported purchases, refunds/outliers, pause and protected history. All fixtures rolled back.' as result;
