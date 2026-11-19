begin;
do $$
declare u uuid:=gen_random_uuid(); l uuid; r uuid; slot timestamptz; rid uuid:=gen_random_uuid(); actual timestamptz;
begin
 insert into auth.users(id,email) values(u,'limit-test-'||u::text||'@example.invalid');
 insert into finance_ai_connections(owner_id,provider,model,credential,key_suffix,request_limit) values(u,'openai','gpt-4.1-mini',repeat('x',80),'test',2);
 insert into finance_ai_settings(owner_id,active_provider) values(u,'openai');
 insert into finance_ai_budgets(owner_id,daily_micros,monthly_micros) values(u,1000,2000);
 insert into finance_autopilot_settings(owner_id,enabled,background_enabled,provider,model) values(u,true,true,'openai','gpt-4.1-mini');
 insert into finance_ai_receipt_runs(owner_id,request_id,provider,model,input_hash,status,started_at)
 select u,gen_random_uuid(),'openai','gpt-4.1-mini',repeat('a',64),'failed',now()-i*interval '1 hour' from generate_series(1,3)i;
 slot:=now()+interval '22 hours';
 l:=(finance_autopilot_begin(u)->>'lease')::uuid;
 perform finance_autopilot_end(u,l,'limit','count cap','[]');
 select next_run_at into actual from finance_autopilot_settings where owner_id=u;
 if actual<>slot then raise exception 'Expected the second newest request to expire';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 select id into r from finance_ai_receipt_runs where owner_id=u limit 1;
 insert into finance_ai_charges(owner_id,run_id,state,reserved_micros,cost_micros,rates,stage,settled_at) values(u,r,'settled',900,900,'{}','analysis',now());
 perform finance_set_ai_request_limit('openai',4,1);
 if (select next_run_at from finance_autopilot_settings where owner_id=u)<>now() then raise exception 'Request increase did not wake saved work';end if;
 l:=(finance_autopilot_begin(u)->>'lease')::uuid;perform finance_autopilot_wait(u,l,500,'[]');
 if (select next_run_at from finance_autopilot_settings where owner_id=u)<>(date_trunc('day',now() at time zone 'UTC')+interval '1 day') at time zone 'UTC' then raise exception 'Expected next UTC day';end if;
 perform finance_set_ai_budget(1000,1100,1);
 if (select next_run_at from finance_autopilot_settings where owner_id=u)<>(date_trunc('month',now() at time zone 'UTC')+interval '1 month') at time zone 'UTC' then raise exception 'Expected next UTC month';end if;
 perform finance_set_ai_budget(2000,3000,2);
 if (select next_run_at from finance_autopilot_settings where owner_id=u)<>now() then raise exception 'Affordable task did not wake';end if;
 update finance_ai_charges set state='uncertain',settled_at=null where owner_id=u;
 l:=(finance_autopilot_begin(u)->>'lease')::uuid;perform finance_autopilot_wait(u,l,1200,'[]');
 if (select next_run_at from finance_autopilot_settings where owner_id=u)<>'infinity' then raise exception 'Unresolved hold was treated as expired';end if;
 update finance_ai_charges set state='released' where owner_id=u;
 if (select next_run_at from finance_autopilot_settings where owner_id=u)<>now() then raise exception 'Cleared hold did not wake';end if;
 update finance_autopilot_settings set enabled=false,background_enabled=false,status='paused',next_run_at='infinity' where owner_id=u;
 perform finance_set_ai_request_limit('openai',7,2);
 if (select next_run_at from finance_autopilot_settings where owner_id=u)<>'infinity' then raise exception 'User pause was overridden';end if;
 if has_function_privilege('authenticated','finance_autopilot_wait(uuid,uuid,bigint,jsonb)','execute') then raise exception 'Worker control exposed';end if;
end;$$;
select 'Passed request window, daily and monthly budgets, lower and higher limits, holds, explicit pause and private worker access' as result;
rollback;
