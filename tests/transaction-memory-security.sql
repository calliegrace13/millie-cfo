begin;
create temp table tm as select user_id u,partner_user_id p,gen_random_uuid() a,gen_random_uuid() b,gen_random_uuid() seed,gen_random_uuid() other,gen_random_uuid() outlier,gen_random_uuid() refund,gen_random_uuid() manual from partner_links where status='active' limit 1;
grant select on tm to authenticated;
insert into accounts(id,user_id,name,type,currency) select a,u,'Memory fixture USD','credit','USD' from tm union all select b,u,'Memory fixture EUR','credit','EUR' from tm;
insert into transactions(id,user_id,account_id,name,merchant_name,date,amount,category,classification_source,needs_review)
select seed,u,a,'MTA fixture','Memory validation merchant',current_date,3,'Transportation','auto',true from tm union all
select other,u,a,'MTA fixture','Memory validation merchant',current_date,2.9,'Other','auto',true from tm union all
select outlier,u,a,'MTA fixture','Memory validation merchant',current_date,50,'Transportation','auto',true from tm union all
select refund,u,a,'MTA refund','Memory validation merchant',current_date,-3,'Transportation','auto',true from tm union all
select manual,u,a,'MTA fixture','Memory validation merchant',current_date,3,'Shopping','user',false from tm;
insert into transactions(user_id,account_id,name,merchant_name,date,amount,category,classification_source,needs_review)
select u,b,'MTA EUR fixture','Memory validation merchant',current_date,3,'Transportation','auto',true from tm;
create temp table tm_protected as select id,md5(to_jsonb(t)::text) stamp from transactions t where id in(select outlier from tm union all select refund from tm union all select manual from tm);
grant select on tm_protected to authenticated;
set local role authenticated;
do $$declare f record;j jsonb;n integer;blocked boolean;begin
 select * into strict f from tm;
 perform set_config('request.jwt.claim.role','authenticated',true);perform set_config('request.jwt.claim.sub',f.p::text,true);
 blocked:=false;begin perform finance_preview_transaction_memory(f.seed,'Transportation',3);exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Partner preview leaked';end if;
 perform set_config('request.jwt.claim.sub',f.u::text,true);
 j:=finance_preview_transaction_memory(f.seed,'Transportation',3);
 if not (j->>'eligible')::boolean or jsonb_array_length(j->'matches')<>2 then raise exception 'Preview did not isolate safe USD purchases';end if;
 blocked:=false;begin perform finance_save_transaction_memory(f.seed,'Shopping',3,'matching',j);exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Changed category accepted without a fresh preview';end if;
 j:=finance_preview_transaction_memory(f.seed,'Transportation',3);
 n:=finance_save_transaction_memory(f.seed,'Transportation',3,'matching',j);
 if n<>2 or exists(select 1 from transactions where id in(f.seed,f.other) and (needs_review or category<>'Transportation' or merchant_routine_id is null)) then raise exception 'First approval failed';end if;
 blocked:=false;begin perform finance_save_transaction_memory(f.seed,'Transportation',3,'matching',j);exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Stale preview accepted';end if;
 if exists(select 1 from transactions t join tm_protected p on p.id=t.id where md5(to_jsonb(t)::text)<>p.stamp) then raise exception 'Protected exception changed';end if;
end;$$;
reset role;
insert into transactions(user_id,account_id,name,merchant_name,date,amount,category,classification_source,needs_review)
select u,a,'Future ordinary fixture','Memory validation merchant',current_date,3,'Other','auto',true from tm union all
select u,a,'Future large fixture','Memory validation merchant',current_date,5,'Other','auto',true from tm;
do $$begin
 if exists(select 1 from transactions where account_id in(select a from tm) and name='Future ordinary fixture' and (needs_review or category<>'Transportation' or merchant_routine_id is null)) then raise exception 'Future purchase not remembered';end if;
 if exists(select 1 from transactions where account_id in(select a from tm) and name='Future large fixture' and not needs_review) then raise exception 'Outlier auto-approved';end if;
end;$$;
set local role authenticated;
do $$declare f record;j jsonb;n integer;begin
 select * into strict f from tm;perform set_config('request.jwt.claim.sub',f.u::text,true);
 j:=finance_preview_transaction_memory(f.seed,'Travel',3);n:=finance_save_transaction_memory(f.seed,'Travel',3,'matching',j);
 if n<>3 or exists(select 1 from transactions where id in(f.seed,f.other) and category<>'Travel') then raise exception 'Remembered group could not be updated';end if;
 j:=finance_preview_transaction_memory(f.seed,'Shopping',3);n:=finance_save_transaction_memory(f.seed,'Shopping',3,'one',j);
 if (select category<>'Shopping' or merchant_routine_id is not null from transactions where id=f.seed) then raise exception 'Individual exception failed';end if;
 if not exists(select 1 from finance_merchant_preferences where owner_id=f.u and merchant_key=j->>'key' and category='Travel' and auto_approve) then raise exception 'Individual correction changed the rule';end if;
 j:=finance_preview_transaction_memory(f.other,'Transportation',3);n:=finance_save_transaction_memory(f.other,'Transportation',3,'matching',j);
 if n<>2 or (select category from transactions where id=f.seed)<>'Shopping' then raise exception 'Group overwrote the individual exception';end if;
end;$$;
reset role;
insert into finance_documents(owner_id,kind,name,payload) select u,'close','Memory held fixture',jsonb_build_object('reviewScope',jsonb_build_object('version',1,'ownerId',u,'start','1901-01-01','end','1901-03-31','accountIds',jsonb_build_array(a))) from tm;
insert into transactions(user_id,account_id,name,merchant_name,date,amount,category,classification_source,needs_review) select u,a,'Held fixture','Memory validation merchant','1901-01-15',3,'Other','auto',true from tm;
do $$begin if exists(select 1 from transactions where account_id in(select a from tm) and name='Held fixture' and (not needs_review or category<>'Other')) then raise exception 'Held import changed';end if;end;$$;
rollback;
select 'PASS: first purchase learning, rule updates, individual exceptions, future imports, thresholds, currency, owner isolation, stale previews, protected history. All fixtures rolled back.' result;
