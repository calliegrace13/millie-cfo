begin;
create temp table cf as select id u,(select id from auth.users where id<>a.id limit 1) other,gen_random_uuid() account,gen_random_uuid() tx,gen_random_uuid() ctx,gen_random_uuid() run from auth.users a limit 1;
grant select on cf to authenticated;
-- This suite exercises the manual workflow; AI linking has a separate suite.
update finance_ai_policies set mode='manual' where owner_id=(select u from cf) and module='transactions';
insert into accounts(id,user_id,name,type,currency) select account,u,'Context fixture','credit','USD' from cf;
insert into transactions(id,user_id,account_id,name,date,amount,category,pending,needs_review) select tx,u,account,'Context fixture',date '2095-01-01',100,'Other',false,true from cf;
set local role authenticated;
do $$declare f record;blocked boolean;begin
 select * into strict f from cf;perform set_config('request.jwt.claim.sub',f.u::text,true);
 perform finance_save_context(f.ctx,0,'contract','Test contract','Coverage evidence','2095-01-01','2095-12-31',array[f.tx],false);
 if not exists(select 1 from finance_context_records where id=f.ctx and revision=1 and snapshots?f.tx::text) then raise exception 'Context snapshot missing';end if;
 perform finance_save_context(f.ctx,0,'contract','Test contract','Coverage evidence','2095-01-01','2095-12-31',array[f.tx],false);
 if (select count(*) from finance_context_history where record_id=f.ctx)<>1 then raise exception 'Retry duplicated history';end if;
 blocked:=false;begin perform finance_save_context(f.ctx,0,'contract','Changed','',null,null,array[f.tx],false);exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Stale revision accepted';end if;
 blocked:=false;begin update finance_context_records set notes='Direct' where id=f.ctx;exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'Direct writes allowed';end if;
 blocked:=false;begin perform finance_save_context(gen_random_uuid(),0,'purchase','Foreign','',null,null,array[gen_random_uuid()],false);exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Unknown source accepted';end if;
 blocked:=false;begin perform finance_save_context(gen_random_uuid(),0,'receipt','Fabricated','',null,null,'{}',false);exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Receipt provenance editable';end if;
 if f.other is null then raise exception 'A second user is needed for the isolation test';end if;
 perform set_config('request.jwt.claim.sub',f.other::text,true);
 if exists(select 1 from finance_context_records where id=f.ctx) or exists(select 1 from finance_context_history where record_id=f.ctx) then raise exception 'Other user read evidence';end if;
 blocked:=false;begin perform finance_save_context(f.ctx,1,'contract','Hijack','',null,null,'{}',true);exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Other user changed evidence';end if;
end;$$;
reset role;
insert into finance_ai_receipt_runs(id,owner_id,request_id,input_hash,provider,model) select run,u,gen_random_uuid(),'context-fixture','fixture','fixture' from cf;
update finance_ai_receipt_runs set status='succeeded',result=jsonb_build_object('receipts',jsonb_build_array(jsonb_build_object('merchant','Context fixture','reference','CONTEXT-TEST','date','2095-01-01','amount',100,'currency','USD','items',jsonb_build_array(jsonb_build_object('name','Item','category','Other'))))) where id=(select run from cf);
do $$declare n int;begin
 select count(*) into n from finance_context_records where owner_id=(select u from cf) and kind='receipt';perform finance_capture_context_receipts((select run from cf));
 if (select count(*) from finance_context_records where owner_id=(select u from cf) and kind='receipt')<>n then raise exception 'Receipt capture duplicated';end if;
 if not exists(select 1 from finance_context_records where owner_id=(select u from cf) and receipt->>'reference'='CONTEXT-TEST' and transaction_ids='{}') then raise exception 'Receipt absent or auto-confirmed';end if;
 if not exists(select 1 from transactions where id=(select tx from cf) and amount=100 and category='Other' and needs_review) then raise exception 'Context changed accounting';end if;
end;$$;
-- A removed source leaves its snapshot and revisions; no source is recreated.
delete from transactions where id=(select tx from cf);
set local role authenticated;
do $$declare f record;status jsonb;begin select * into f from cf;perform set_config('request.jwt.claim.sub',f.u::text,true);
 perform finance_save_context(f.ctx,1,'contract','Test contract','Coverage evidence','2095-01-01','2095-12-31',array[f.tx],true);
 if not exists(select 1 from finance_context_records where id=f.ctx and archived and snapshots?f.tx::text) then raise exception 'Unlink lost saved context';end if;
 status:=finance_context_connection_status();if status::text like '%credential%' or status::text like '%access_token%' or status::text like '%body_cipher%' then raise exception 'Secrets leaked in connection health';end if;
end;$$;
reset role;
select 'PASS context ownership, private revisions, idempotency, conflict handling, receipt provenance, immutable ledger, retained evidence and safe connection metadata' as result;
rollback;
