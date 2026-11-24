do $$declare u uuid:=gen_random_uuid();other_owner uuid:=gen_random_uuid();r jsonb;req uuid;blocked boolean;before_key text;begin
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into finance_ai_connections(owner_id,provider,model,credential,key_suffix,request_limit,request_limit_enabled) values(u,'openai','fixture','fixture-encrypted-key','test',1,false),(u,'anthropic','fixture','another-key','test',1,false);
 insert into finance_ai_settings values(u,'openai');insert into finance_ai_budgets values(u,1000000,5000000);
 insert into finance_ai_prices values('openai','fixture',1,1,1,1,100000,10000,now()+interval '1 day'),('openai','second',1,1,1,1,100000,10000,now()+interval '1 day'),('anthropic','fixture',1,1,1,1,100000,10000,now()+interval '1 day');
 perform finance_set_ai_credit('openai',50000,(now() at time zone 'UTC')::date,null);
 req:=gen_random_uuid();r:=finance_ai_reserve(u,req,repeat('1',64),repeat('2',64),1000,6000,false,'openai','fixture');
 if (finance_ai_credit_status(u,'openai')->>'remainingMicros')::bigint<>38904 then raise exception 'Pending maximum was not deducted';end if;
 update finance_ai_receipt_runs set status='succeeded',result='{"fixture":true}' where id=(r->>'id')::uuid;
 update finance_ai_charges set state='settled',cost_micros=2000,settled_at=now() where run_id=(r->>'id')::uuid;
 if (finance_ai_credit_status(u,'openai')->>'remainingMicros')::bigint<>48000 then raise exception 'Unused reservation not released';end if;
 perform finance_set_ai_credit('openai',10000,(now() at time zone 'UTC')::date,1);
 blocked:=false;begin perform finance_ai_reserve(u,gen_random_uuid(),repeat('3',64),repeat('4',64),1000,6000,false,'openai','fixture');exception when raise_exception then if sqlerrm not like 'Your AI credit cannot%' then raise;end if;blocked:=true;end;
 if not blocked then raise exception 'Credit ceiling bypassed';end if;
 if finance_ai_next_window(u,11096)<>'infinity' then raise exception 'Credit exhaustion would repeatedly retry';end if;
 -- Credit checkpoints use current balance, not the original grant. Older costs
 -- do not get counted twice. Switching models shares the provider credit.
 perform finance_set_ai_credit('openai',20000,(now() at time zone 'UTC')::date,2);
 if (finance_ai_credit_status(u,'openai')->>'remainingMicros')::bigint<>20000 then raise exception 'Historical usage deducted twice';end if;
 insert into finance_autopilot_settings(owner_id,enabled,background_enabled,provider,model,revision,status,lease_until,workflow_scope,failure_count) values(u,true,true,'openai','fixture',1,'working',clock_timestamp()+interval '1 minute','all_enabled',0);
 blocked:=false;begin perform finance_ai_choose(u,'anthropic',false);exception when raise_exception then if sqlerrm not like 'Your current task is still running%' then raise;end if;blocked:=true;end;
 if not blocked then raise exception 'Provider switch interrupted a live call';end if;
 update finance_autopilot_settings set lease_until=null where owner_id=u;
 insert into finance_autopilot_work(owner_id,status,created_at) values(u,'running',clock_timestamp()+interval '1 second');
 perform finance_ai_choose(u,'anthropic',false);
 if (select status from finance_autopilot_work where owner_id=u)<>'skipped' then raise exception 'Unsent task not superseded safely';end if;
 if (select provider from finance_autopilot_settings where owner_id=u)<>'anthropic' then raise exception 'Background work did not follow selected provider';end if;
 perform finance_ai_choose(u,'openai',false);
 perform finance_ai_set_model(u,'openai','second',1);
 if (select model from finance_autopilot_settings where owner_id=u)<>'second' then raise exception 'Background work did not follow selected model';end if;
 if (select credential from finance_ai_connections where owner_id=u and provider='openai')<>'fixture-encrypted-key' then raise exception 'Model change mutated key';end if;
 if (select request_limit_enabled from finance_ai_connections where owner_id=u and provider='openai') then raise exception 'Model change re-enabled count cap';end if;
 if (select daily_micros from finance_ai_budgets where owner_id=u)<>1000000 then raise exception 'Model change raised budget';end if;
 blocked:=false;begin perform finance_ai_set_model(u,'openai','unpriced',2);exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Unpriced model admitted';end if;
 blocked:=false;begin perform finance_ai_set_model(u,'openai','fixture',1);exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Stale model revision admitted';end if;
 update finance_ai_credits set expires_on=(now() at time zone 'UTC')::date-1 where owner_id=u;
 blocked:=false;begin perform finance_ai_reserve(u,gen_random_uuid(),repeat('3',64),repeat('4',64),1000,6000,false,'openai','second');exception when raise_exception then if sqlerrm not like 'Your AI credit has expired%' then raise;end if;blocked:=true;end;if not blocked then raise exception 'Expired credit admitted';end if;
 -- Cached paid results stay recoverable after expiry, without a new reservation.
 r:=finance_ai_reserve(u,req,repeat('1',64),repeat('2',64),1000,6000,false,'openai','second');if r->>'status'<>'succeeded' then raise exception 'Credit blocked cached recovery';end if;
 if finance_ai_next_window(u,1)<>'infinity' then raise exception 'Expired credit would retry';end if;
 update finance_ai_settings set active_provider='anthropic' where owner_id=u;
 if finance_ai_next_window(u,11096)>now() then raise exception 'Other provider inherited exhausted credit';end if;
 if finance_ai_credit_status(u,'anthropic') is not null then raise exception 'Credit leaked across providers';end if;
 -- A balance refreshed during a call still includes that reservation. Uncertain
 -- charges remain held. Refreshing cannot turn an in-flight call into free work.
 update finance_ai_settings set active_provider='openai' where owner_id=u;
 perform finance_set_ai_credit('openai',50000,(now() at time zone 'UTC')::date,3);
 r:=finance_ai_reserve(u,gen_random_uuid(),repeat('5',64),repeat('6',64),1000,6000,false,'openai','second');
 update finance_ai_charges set state='uncertain' where run_id=(r->>'id')::uuid;
 perform finance_set_ai_credit('openai',50000,(now() at time zone 'UTC')::date,4);
 if (finance_ai_credit_status(u,'openai')->>'remainingMicros')::bigint<>38904 then raise exception 'Uncertain charge vanished at balance refresh';end if;
 update finance_ai_charges set state='settled',cost_micros=3000,settled_at=now() where run_id=(r->>'id')::uuid;
 if (finance_ai_credit_status(u,'openai')->>'remainingMicros')::bigint<>47000 then raise exception 'Pending settlement deducted incorrectly';end if;
 perform set_config('request.jwt.claim.sub',other_owner::text,true);
 if jsonb_array_length(finance_ai_status()->'connections')<>0 then raise exception 'Private credit metadata leaked';end if;
 blocked:=false;begin perform finance_clear_ai_credit('openai',5);exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Another user cleared credit';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform finance_clear_ai_credit('openai',5);
 if finance_ai_credit_status(u,'openai') is not null then raise exception 'Clear did not restore normal budget mode';end if;
 if has_function_privilege('authenticated','finance_ai_set_model(uuid,text,text,integer)','EXECUTE') or has_function_privilege('authenticated','finance_ai_credit_status(uuid,text)','EXECUTE') or has_table_privilege('authenticated','finance_ai_credits','SELECT') then raise exception 'Unsafe direct credit access';end if;
end;$$;
rollback;
