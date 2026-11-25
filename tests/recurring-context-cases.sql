do $$declare u uuid:=gen_random_uuid();other_owner uuid:=gen_random_uuid();a uuid:=gen_random_uuid();tx uuid:=gen_random_uuid();r jsonb;trip uuid;rev integer;flight uuid:=gen_random_uuid();run uuid:=gen_random_uuid();blocked boolean;ev jsonb:='[{"source_calendar":"primary","event_id":"out","kind":"flight","title":"Flight from LGA to DFW","starts_on":"2026-12-01","ends_on":"2026-12-01"}]';ts jsonb:='[{"source_key":"primary:out","name":"Dallas trip","destination":"DFW","starts_on":"2026-12-01","ends_on":"2026-12-05","auto_dates":true}]';begin
 insert into auth.users values(u),(other_owner);insert into accounts(id,user_id,name,type,currency) values(a,u,'Fixture','credit','USD');
 insert into transactions(id,user_id,account_id,name,merchant_name,date,amount,pending,category,needs_review) values(tx,u,a,'Meal','Meal','2026-12-02',20,false,'Food & Dining',false);
 r:=finance_calendar_import(u,ev,ts);if (r->>'tripsAdded')::integer<>1 then raise exception 'Calendar trip not created';end if;
 select id,revision into trip,rev from finance_trips where owner_id=u;
 insert into transactions(id,user_id,account_id,name,merchant_name,date,amount,pending,category,needs_review) values(flight,u,a,'Delta','Delta','2026-10-01',500,false,'Travel',false);
 insert into finance_ai_policies(owner_id,module,mode,tasks) values(u,'transactions','ai',array['receipts']);
 insert into finance_ai_receipt_runs(id,owner_id,status,result) values(run,u,'running','{}');
 update finance_ai_receipt_runs set status='succeeded',result=jsonb_build_object('receipts',jsonb_build_array(jsonb_build_object('merchant','Delta','reference','fixture','date','2026-10-01','amount',500,'currency','USD','travel',jsonb_build_array(jsonb_build_object('start_date','2026-12-01','end_date','2026-12-05'))))) where id=run;
 if not exists(select 1 from finance_trip_links where owner_id=u and transaction_id=flight and trip_id=trip and source='receipt') then raise exception 'Advance flight payment was not linked by actual travel dates';end if;
 blocked:=false;begin perform finance_calendar_import(u,ev,ts,'cancelled-credential',true);exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Disconnected calendar sync could commit';end if;

 if not exists(select 1 from finance_trip_links where owner_id=u and transaction_id=tx and trip_id=trip) then raise exception 'Trip window did not assign eligible purchase';end if;
 perform finance_calendar_import(u,ev,ts);if (select count(*) from finance_trips where owner_id=u)<>1 then raise exception 'Calendar replay duplicated trip';end if;
 if (select revision from finance_trips where id=trip)<>rev then raise exception 'Unchanged sync churned trip evidence';end if;
 perform finance_trip_write_link(u,tx,null,'manual',true,true,'Excluded by user');
 perform finance_calendar_import(u,ev,ts);if (select trip_id from finance_trip_links where owner_id=u and transaction_id=tx) is not null then raise exception 'Manual exclusion was overwritten';end if;
 update finance_trips set name='My edited trip',revision=revision+1 where id=trip;
 perform finance_calendar_import(u,ev,ts);if (select name from finance_trips where id=trip)<>'My edited trip' then raise exception 'Calendar overwrote a manual trip edit';end if;
 insert into finance_assistant_items(owner_id,module,task,kind,payload,status,updated_at) values
 (u,'transactions','categories','question',jsonb_build_object('transaction_id',tx,'question','What was this?','scope','{"start":"2026-12-01"}'::jsonb),'needs_input',now()),
 (u,'everyday','budget','question','{"question":"What target?","scope":{"start":"2026-12-01"}}','needs_input',now()-interval '1 day'),
 (u,'everyday','budget','question','{"question":"What target?","scope":{"start":"2026-12-01"}}','needs_input',now()),
 (u,'everyday','budget','question','{"question":"Different target?","scope":{"start":"2026-12-01"}}','needs_input',now()),
 (other_owner,'everyday','budget','question','{"question":"What target?","scope":{"start":"2026-12-01"}}','needs_input',now());
 perform set_config('request.jwt.claim.sub',u::text,true);
 r:=finance_set_context_automation(true);if (r->>'questionsResolved')::integer<>2 then raise exception 'Expected one resolved purchase and one duplicate question, got %',r;end if;
 if (select count(*) from finance_assistant_items where owner_id=u and status='needs_input')<>2 then raise exception 'Distinct owner preferences were hidden';end if;
 if (select count(*) from finance_assistant_items where owner_id=other_owner and status='needs_input')<>1 then raise exception 'Other owner questions changed';end if;
 if (select count(*) from finance_assistant_history where owner_id=u)<>2 then raise exception 'Resolution audit missing';end if;
 if (select amount from transactions where id=tx)<>20 then raise exception 'Context changed bank amount';end if;
 if has_table_privilege('authenticated','finance_calendar_connections','SELECT') or has_function_privilege('authenticated','finance_calendar_import(uuid,jsonb,jsonb,text,boolean)','EXECUTE') then raise exception 'Unsafe calendar access';end if;
end;$$;
rollback;
