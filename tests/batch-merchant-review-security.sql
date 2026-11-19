begin;
create temp table br as select user_id u,partner_user_id p,gen_random_uuid() a,gen_random_uuid() x,gen_random_uuid() y,gen_random_uuid() z,gen_random_uuid() w from partner_links where status='active' limit 1;
grant select on br to authenticated;
insert into accounts(id,user_id,name,type,currency) select a,u,'Batch review fixture','credit','USD' from br;
insert into transactions(id,user_id,account_id,name,merchant_name,date,amount,category,classification_source,needs_review)
select x,u,a,'Cafe fixture','Batch validation cafe',current_date,4,'Food & Dining','auto',true from br union all
select y,u,a,'AMZN Mktp fixture','Batch validation amazon',current_date,24,'Shopping','auto',true from br union all
select z,u,a,'AMAZON FRESH fixture','Batch validation amazon',current_date,32,'Shopping','auto',true from br union all select w,u,a,'Transit fixture','Batch validation transit',current_date,3,'Transportation','auto',true from br;
create function pg_temp.br_snapshot(_id uuid) returns jsonb language sql as $$select jsonb_build_object('id',t.id,'updated_at',t.updated_at,'amount',t.amount,'date',t.date,'account_id',t.account_id,'category',t.category) from transactions t where id=_id$$;
set local role authenticated;
do $$declare f record;r jsonb;items jsonb;result jsonb;blocked boolean;begin
 select * into strict f from br;perform set_config('request.jwt.claim.role','authenticated',true);perform set_config('request.jwt.claim.sub',f.u::text,true);
 r:=jsonb_build_array(jsonb_build_object('key','merchant:batch validation cafe','currency','USD','category','Food & Dining','max',10,'expected',jsonb_build_array(pg_temp.br_snapshot(f.x))),jsonb_build_object('key','merchant:batch validation transit','currency','USD','category','Transportation','max',5,'expected',jsonb_build_array(pg_temp.br_snapshot(f.w))));
 items:=jsonb_build_array(jsonb_build_object('category','Shopping','expected',pg_temp.br_snapshot(f.y)),jsonb_build_object('category','Groceries','expected',pg_temp.br_snapshot(f.z)));
 perform set_config('request.jwt.claim.sub',f.p::text,true);blocked:=false;begin perform finance_save_merchant_review_batch(r,items);exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Partner changed owner batch';end if;
 perform set_config('request.jwt.claim.sub',f.u::text,true);
 -- A stale purchase must roll back the ordinary merchant rule as well.
 blocked:=false;begin perform finance_save_merchant_review_batch(r,jsonb_set(items,'{1,expected,category}','"incorrect preview"'));exception when raise_exception then blocked:=true;end;
 if not blocked or exists(select 1 from finance_merchant_preferences where owner_id=f.u and merchant_key='merchant:batch validation cafe') or exists(select 1 from transactions where id in(f.x,f.y,f.z) and not needs_review) then raise exception 'Failed batch partially applied';end if;
 blocked:=false;begin perform finance_save_merchant_review_batch(r,items||jsonb_build_array(items->0));exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Duplicate transaction accepted';end if;
 result:=finance_save_merchant_review_batch(r,items);
 if (result->>'purchases')::integer<>4 or (result->>'routines')::integer<>2 then raise exception 'Batch counts incorrect';end if;
 if exists(select 1 from transactions where id in(f.x,f.y,f.z) and needs_review) or (select category from transactions where id=f.z)<>'Groceries' then raise exception 'Decisions not applied';end if;
 if exists(select 1 from finance_merchant_preferences where owner_id=f.u and merchant_key='merchant:batch validation amazon') then raise exception 'Amazon decisions created a blanket routine';end if;
 if exists(select 1 from transactions where id=f.y and (amount<>24 or account_id<>f.a)) or exists(select 1 from transactions where id=f.z and (amount<>32 or account_id<>f.a)) then raise exception 'Purchase money changed';end if;
 blocked:=false;begin perform finance_save_merchant_review_batch(r,items);exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Repeated stale approval accepted';end if;
end;$$;
reset role;
insert into finance_documents(owner_id,kind,name,payload) select u,'close','Batch held fixture',jsonb_build_object('reviewScope',jsonb_build_object('version',1,'ownerId',u,'start','1901-01-01','end','1901-03-31','accountIds',jsonb_build_array(a))) from br;
insert into transactions(user_id,account_id,name,merchant_name,date,amount,category,classification_source,needs_review) select u,a,'AMZN held fixture','Batch validation amazon','1901-01-15',3,'Shopping','auto',true from br;
set local role authenticated;
do $$declare f record;t transactions;blocked boolean;begin
 select * into strict f from br;perform set_config('request.jwt.claim.sub',f.u::text,true);
 select * into strict t from transactions where account_id=f.a and name='AMZN held fixture';
 blocked:=false;begin perform finance_save_merchant_review_batch('[]',jsonb_build_array(jsonb_build_object('category','Groceries','expected',pg_temp.br_snapshot(t.id))));exception when raise_exception then blocked:=true;end;
 if not blocked or (select category<>'Shopping' or not needs_review from transactions where id=t.id) then raise exception 'Held period modified by batch';end if;
end;$$;
reset role;
rollback;
select 'PASS: owner isolation, atomic rollback, duplicate prevention, multiple categories, no blanket Amazon rule, immutable amounts and stale approvals. Fixtures rolled back.' result;
