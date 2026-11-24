do $$declare u uuid:=gen_random_uuid();r jsonb;blocked boolean;req uuid;due timestamptz;i int;begin
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into finance_ai_connections(owner_id,provider,model,credential,key_suffix,request_limit,request_limit_enabled) values(u,'fixture','fixture','not-a-real-key','test',1,true);
 insert into finance_ai_settings values(u,'fixture');insert into finance_ai_budgets values(u,1000000,5000000);
 insert into finance_ai_prices values('fixture','fixture',1,1,1,1,100000,10000,now()+interval '1 day');
 r:=finance_ai_reserve(u,gen_random_uuid(),md5('first')||md5('first'),md5('firstcache')||md5('firstcache'),1000,6000,false,'fixture','fixture');
 update finance_ai_receipt_runs set status='succeeded',result='{"fixture":true}' where id=(r->>'id')::uuid;
 update finance_ai_charges set state='settled',cost_micros=1000,settled_at=now() where run_id=(r->>'id')::uuid;
 blocked:=false;begin perform finance_ai_reserve(u,gen_random_uuid(),repeat('a',64),repeat('b',64),1000,6000,false,'fixture','fixture');exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Optional request cap was ignored';end if;
 if finance_ai_next_window(u,0)<=now() then raise exception 'Enabled request cap did not delay resumption';end if;
 perform finance_set_ai_limit_mode('fixture',false,1);
 if finance_ai_next_window(u,0)>now() then raise exception 'Dollar-only mode still waits on request count';end if;
 for i in 1..10 loop
  req:=gen_random_uuid();r:=finance_ai_reserve(u,req,md5(req::text)||md5(req::text),md5('cache'||req::text)||md5('cache'||req::text),1000,6000,false,'fixture','fixture');
  if r->>'status'<>'new' then raise exception 'Budgeted request above count cap failed';end if;
  -- The concurrency guard remains in place even with request counting disabled.
  blocked:=false;begin perform finance_ai_reserve(u,gen_random_uuid(),repeat('c',64),repeat('d',64),1000,6000,false,'fixture','fixture');exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Concurrent provider request admitted';end if;
  update finance_ai_receipt_runs set status='succeeded',result='{"fixture":true}' where id=(r->>'id')::uuid;
  update finance_ai_charges set state='settled',cost_micros=1000,settled_at=now() where run_id=(r->>'id')::uuid;
 end loop;
 if (select daily_micros from finance_ai_budgets where owner_id=u)<>1000000 or (select monthly_micros from finance_ai_budgets where owner_id=u)<>5000000 then raise exception 'Limit mode changed dollars';end if;
 update finance_ai_budgets set daily_micros=20000 where owner_id=u;
 blocked:=false;begin perform finance_ai_reserve(u,gen_random_uuid(),repeat('e',64),repeat('f',64),1000,6000,false,'fixture','fixture');exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Daily dollar ceiling bypassed';end if;
 due:=finance_ai_next_window(u,11096);if due<=now() then raise exception 'Daily exhaustion did not schedule next dollar window';end if;
 update finance_ai_budgets set daily_micros=1000000,monthly_micros=20000 where owner_id=u;
 blocked:=false;begin perform finance_ai_reserve(u,gen_random_uuid(),repeat('e',64),repeat('f',64),1000,6000,false,'fixture','fixture');exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Monthly ceiling bypassed';end if;
 if finance_ai_next_window(u,11096)<(date_trunc('month',now() at time zone 'UTC')+interval '1 month') at time zone 'UTC' then raise exception 'Monthly resumption was too early';end if;
 -- Existing results are recoverable even after the budget is exhausted.
 r:=finance_ai_reserve(u,req,md5(req::text)||md5(req::text),md5('cache'||req::text)||md5('cache'||req::text),1000,6000,false,'fixture','fixture');
 if r->>'status'<>'succeeded' then raise exception 'Cached recovery blocked at budget';end if;
end;$$;
rollback;
