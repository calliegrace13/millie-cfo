begin;
create temp table af as select user_id u,partner_user_id partner,gen_random_uuid() account,gen_random_uuid() tx,gen_random_uuid() plan_tx,gen_random_uuid() closed_tx,gen_random_uuid() job,gen_random_uuid() plan_job,gen_random_uuid() closed_job,gen_random_uuid() item,gen_random_uuid() plan_item,gen_random_uuid() closed_item,gen_random_uuid() question from partner_links where status='active' limit 1;
grant select on af to authenticated;
insert into accounts(id,user_id,name,type,currency) select account,u,'Assistant security fixture','credit','USD' from af;
insert into transactions(id,user_id,account_id,name,merchant_name,date,amount,category,classification_source,needs_review)
 select tx,u,account,'Transit fixture','Assistant transit',date '2090-01-01',3,'Transportation','auto',true from af union all
 select plan_tx,u,account,'Annual service fixture','Assistant service',date '2090-01-01',1200,'Bills & Utilities','auto',true from af union all
 select closed_tx,u,account,'Held purchase fixture','Assistant held',date '2090-01-02',6,'Food & Dining','auto',true from af;
create function pg_temp.af_snapshot(_id uuid) returns jsonb language sql as $$select jsonb_build_object('id',t.id,'updated_at',t.updated_at,'amount',t.amount,'date',t.date,'account_id',t.account_id,'category',t.category) from transactions t where id=_id$$;
insert into finance_ai_policies(owner_id,module,mode,tasks,auto_tasks) select u,'transactions','ai',array['categories','receipts'],array['categories','receipts'] from af on conflict(owner_id,module) do update set mode='ai',tasks=excluded.tasks,auto_tasks=excluded.auto_tasks,revision=1;
insert into finance_ai_policies(owner_id,module,mode,tasks,auto_tasks) select u,'assets','ai',array['timing'],array['timing'] from af on conflict(owner_id,module) do update set mode='ai',tasks=excluded.tasks,auto_tasks=excluded.auto_tasks,revision=1;
-- Module visibility is another execution gate, and is restored by rollback.
update finance_module_preferences set enabled_modules=array_append(enabled_modules,'assets') where owner_id=(select u from af) and not('assets'=any(enabled_modules));
insert into finance_assistant_jobs(id,owner_id,module,task,policy_revision,context_cipher,snapshot)
 select job,u,'transactions','categories',1,'fixture encrypted placeholder',jsonb_build_object('transactions',jsonb_build_object(tx::text,pg_temp.af_snapshot(tx))) from af union all
 select plan_job,u,'assets','timing',1,'fixture encrypted placeholder',jsonb_build_object('transactions',jsonb_build_object(plan_tx::text,pg_temp.af_snapshot(plan_tx))) from af union all
 select closed_job,u,'transactions','categories',1,'fixture encrypted placeholder',jsonb_build_object('transactions',jsonb_build_object(closed_tx::text,pg_temp.af_snapshot(closed_tx))) from af;
insert into finance_assistant_items(id,owner_id,job_id,module,task,fingerprint,kind,payload,status)
 select item,u,job,'transactions','categories',item::text,'category',jsonb_build_object('transaction_id',tx,'category','Transportation'),'ready' from af union all
 select plan_item,u,plan_job,'assets','timing',plan_item::text,'plan',jsonb_build_object('transaction_id',plan_tx,'category','Bills & Utilities','plan_kind','service','amount',1200,'residual',0,'name','Fixture coverage','start_date','2090-02-01','end_date','2091-01-31'),'ready' from af union all
 select closed_item,u,closed_job,'transactions','categories',closed_item::text,'category',jsonb_build_object('transaction_id',closed_tx,'category','Food & Dining'),'ready' from af union all
 select question,u,job,'transactions','categories',question::text,'question','{"question":"What was purchased?"}','needs_input' from af;
insert into finance_documents(owner_id,kind,name,payload) select u,'close','Assistant held fixture',jsonb_build_object('reviewScope',jsonb_build_object('version',1,'ownerId',u,'accountIds',jsonb_build_array(account),'start','2090-01-02','end','2090-01-02')) from af;
set local role authenticated;
do $$ declare f record;p jsonb;blocked boolean;result jsonb;begin
 select * into strict f from af;perform set_config('request.jwt.claim.role','authenticated',true);perform set_config('request.jwt.claim.sub',f.partner::text,true);
 if exists(select 1 from finance_assistant_items where id=f.item) then raise exception 'Partner saw private AI work';end if;
 blocked:=false;begin perform finance_assistant_apply(f.item,1,true);exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Partner applied another owner item';end if;
 perform set_config('request.jwt.claim.sub',f.u::text,true);
 blocked:=false;begin update finance_assistant_items set status='done' where id=f.item;exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'Direct client write accepted';end if;
 blocked:=false;begin perform context_cipher from finance_assistant_jobs where id=f.job;exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'Encrypted job context exposed';end if;
 blocked:=false;begin perform finance_set_ai_modes(jsonb_build_array(jsonb_build_object('module','transactions','mode','manual','tasks',jsonb_build_array('categories'),'auto','[]'::jsonb,'receipts',false,'web',false,'expected',1),jsonb_build_object('module','assets','mode','manual','tasks',jsonb_build_array('timing'),'auto','[]'::jsonb,'receipts',false,'web',false,'expected',999)));exception when raise_exception then blocked:=true;end;if not blocked or (select mode from finance_ai_policies where owner_id=f.u and module='transactions')<>'ai' then raise exception 'Bulk modes partially saved';end if;
 p:=finance_set_ai_policy('transactions','manual',array['categories','receipts'],array['categories','receipts'],false,false,1);
 blocked:=false;begin perform finance_assistant_apply(f.item,1,true);exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Manual mode auto-applied';end if;
 blocked:=false;begin perform finance_ai_apply_receipts(jsonb_build_array(jsonb_build_object('category','Transportation','expected',pg_temp.af_snapshot(f.tx))));exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Manual receipt approval bypass';end if;
 if not(select needs_review from transactions where id=f.tx) then raise exception 'Changing mode changed ledger';end if;
 blocked:=false;begin perform finance_set_ai_policy('transactions','ai',array['categories'],array['categories'],false,false,1);exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Stale settings accepted';end if;
 perform finance_set_ai_policy('transactions','ai',array['categories'],array['categories'],false,false,2);
 blocked:=false;begin perform finance_assistant_apply(f.item,1,true);exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Stale permission revision auto-applied';end if;
 result:=finance_assistant_apply(f.item,1,false);perform finance_assistant_apply(f.item,1,false);
 if (select amount from transactions where id=f.tx)<>3 or (select date from transactions where id=f.tx)<>date '2090-01-01' then raise exception 'AI rewrote bank facts';end if;
 if (select count(*) from finance_assistant_history where item_id=f.item and action='apply')<>1 then raise exception 'Duplicate apply not idempotent';end if;
 blocked:=false;begin perform finance_assistant_apply(f.closed_item,1,false);exception when raise_exception then blocked:=true;end;if not blocked or not(select needs_review from transactions where id=f.closed_tx) then raise exception 'Closed period changed';end if;
 result:=finance_assistant_apply(f.plan_item,1,true);
 if not exists(select 1 from finance_accounting_plans where id=(result->>'id')::uuid and total_amount=1200 and payments->0->>'transaction_id'=f.plan_tx::text) then raise exception 'Plan did not link original payment';end if;
 perform finance_assistant_apply(f.plan_item,1,true);
 if (select count(*) from finance_accounting_plans where payments->0->>'transaction_id'=f.plan_tx::text)<>1 then raise exception 'Duplicate timing plan';end if;
 perform finance_assistant_update(f.question,1,'answer','{"answer":"Annual service, coverage dates confirmed"}');
 if (select answer from finance_assistant_items where id=f.question)='' then raise exception 'Answer not saved';end if;
 perform finance_assistant_update(f.question,2,'done');
 if not exists(select 1 from finance_ai_policy_history where owner_id=f.u and module='transactions') then raise exception 'Policy audit missing';end if;
end $$;
reset role;
rollback;
select 'PASS: private policies/work, Manual and task gates, stale permissions, atomic applies, duplicate replay, immutable bank facts, held periods, linked timing plan and saved answers; all fixtures rolled back.' as result;
