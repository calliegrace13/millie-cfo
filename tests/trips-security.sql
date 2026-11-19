begin;
create temp table tf as select user_id u,partner_user_id partner,gen_random_uuid() a,gen_random_uuid() tx,gen_random_uuid() flight,gen_random_uuid() second_flight,gen_random_uuid() run,gen_random_uuid() transfer from partner_links where status='active' limit 1;
grant select on tf to authenticated;
create temp table saved_trip(id uuid);grant all on saved_trip to authenticated;
insert into accounts(id,user_id,name,type,currency) select a,u,'Trip test card','credit','USD' from tf;
insert into transactions(id,user_id,account_id,name,merchant_name,date,amount,category,pending,needs_review)
 select tx,u,a,'Trip meal','Trip meal',date '2090-06-01',20,'Food & Dining',false,false from tf union all
 select flight,u,a,'Delta fixture','Delta fixture',date '2090-02-01',500,'Travel',false,false from tf union all
 select transfer,u,a,'Card payment fixture','Card payment fixture',date '2090-06-02',800,'Credit Card Payment',false,false from tf;
insert into finance_ai_policies(owner_id,module,mode,tasks) select u,'transactions','ai',array['receipts'] from tf on conflict(owner_id,module) do update set mode='ai',tasks=array['receipts'],auto_tasks='{}';
set local role authenticated;
do $$declare f record;p uuid;blocked boolean;rev int;begin
 select * into strict f from tf;perform set_config('request.jwt.claim.sub',f.u::text,true);
 p:=finance_save_trip(null,0,'Trip fixture','Rome','2090-06-01','2090-06-10',true,true,array[f.a],false);insert into saved_trip values(p);
 if not exists(select 1 from finance_trip_links where transaction_id=f.tx and trip_id=p and source='date') then raise exception 'Date match failed';end if;
 if exists(select 1 from finance_trip_links where transaction_id=f.transfer and trip_id is not null) then raise exception 'Card payment included';end if;
 if exists(select 1 from finance_trip_links where transaction_id=f.flight and trip_id is not null) then raise exception 'Advance booking matched by purchase date';end if;
 blocked:=false;begin update finance_trip_links set trip_id=null where transaction_id=f.tx;exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'Direct assignment writes allowed';end if;
 blocked:=false;begin perform finance_save_trip(p,0,'Wrong','',date '2090-06-01',date '2090-06-10',true,true,array[f.a],false);exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Stale trip settings allowed';end if;
 select revision into rev from finance_trip_links where transaction_id=f.tx;perform finance_assign_trip(f.tx,null,rev,false,null);perform finance_refresh_trips();
 if not exists(select 1 from finance_trip_links where transaction_id=f.tx and excluded and manual and trip_id is null) then raise exception 'Excluded purchase returned';end if;
 select revision into rev from finance_trip_links where transaction_id=f.tx;perform finance_assign_trip(f.tx,null,rev,true,null);
 if not exists(select 1 from finance_trip_links where transaction_id=f.tx and trip_id=p) then raise exception 'Automatic matching did not resume';end if;
 perform set_config('request.jwt.claim.sub',f.partner::text,true);
 if exists(select 1 from finance_trips where id=p) or exists(select 1 from finance_trip_links where transaction_id=f.tx) then raise exception 'Partner saw private trips';end if;
 blocked:=false;begin perform finance_assign_trip(f.tx,p,rev,false,null);exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Partner assigned owner purchase';end if;
end;$$;
reset role;
insert into finance_ai_receipt_runs(id,owner_id,request_id,input_hash,provider,model) select run,u,gen_random_uuid(),'fixture','fixture','fixture' from tf;
update finance_ai_receipt_runs set status='succeeded',result=jsonb_build_object('receipts',jsonb_build_array(jsonb_build_object('merchant','Delta fixture','reference','TRIP-FIXTURE','date','2090-02-01','amount',500,'currency','USD','travel',jsonb_build_array(jsonb_build_object('kind','flight','start_date','2090-06-01','end_date','2090-06-10','context','Flight departs June 1, 2090 and returns June 10, 2090'))))) where id=(select run from tf);
do $$declare f record;p uuid;n int;begin
 select * into f from tf;select id into p from saved_trip;
 if not exists(select 1 from finance_trip_links where transaction_id=f.flight and trip_id=p and source='receipt') then raise exception 'Receipt travel dates did not match advance booking';end if;
 select count(*) into n from finance_trip_history;perform finance_trip_refresh(f.u);if (select count(*) from finance_trip_history)<>n then raise exception 'Idempotent refresh created duplicate assignments';end if;
 if not exists(select 1 from transactions where id=f.flight and date='2090-02-01' and amount=500 and not needs_review) then raise exception 'Trip changed ledger';end if;
end;$$;
-- A second equal purchase makes the prior automatic receipt match ambiguous.
insert into transactions(id,user_id,account_id,name,merchant_name,date,amount,category,pending) select second_flight,u,a,'Delta fixture','Delta fixture',date '2090-02-01',500,'Travel',false from tf;
do $$begin
 if exists(select 1 from finance_trip_links where transaction_id=(select flight from tf) and trip_id is not null) then raise exception 'Duplicate charge left an automatic receipt match';end if;
 if not exists(select 1 from finance_trip_receipts where owner_id=(select u from tf) and status='pending' and transaction_id is null) then raise exception 'Ambiguous booking not queued';end if;
end;$$;
set local role authenticated;
do $$declare f record;p uuid;p2 uuid;rid uuid;rev int;begin
 select * into f from tf;select id into p from saved_trip;perform set_config('request.jwt.claim.sub',f.u::text,true);
 select id into rid from finance_trip_receipts where owner_id=f.u and receipt->>'reference'='TRIP-FIXTURE';select revision into rev from finance_trip_links where transaction_id=f.flight;
 perform finance_assign_trip(f.flight,p,rev,false,rid);perform finance_refresh_trips();
 if not exists(select 1 from finance_trip_receipts where id=rid and status='manual') then raise exception 'Manual receipt resolution lost';end if;
 p2:=finance_save_trip(null,0,'Overlap fixture','','2090-06-01','2090-06-05',true,false,array[f.a],false);
 if exists(select 1 from finance_trip_links where transaction_id=f.tx and trip_id is not null) then raise exception 'Overlap not cleared for choice';end if;
 if not exists(select 1 from finance_trip_links where transaction_id=f.flight and trip_id=p and manual) then raise exception 'Manual assignment overwritten';end if;
 perform finance_save_trip(p,1,'Trip fixture','Rome','2090-06-01','2090-06-10',true,true,array[f.a],true);
 if not exists(select 1 from finance_trip_links where transaction_id=f.flight and trip_id=p) then raise exception 'Archive removed history';end if;
end;$$;
reset role;
select 'PASS private trips, date matching, movements excluded, advance receipt travel dates, manual overrides, duplicates, overlaps, idempotency, stale protection, archives and unchanged bank facts' as result;
rollback;
