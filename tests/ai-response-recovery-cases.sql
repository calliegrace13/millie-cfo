do $$declare u uuid:=gen_random_uuid();req uuid:=gen_random_uuid();r jsonb;n bigint;begin
 insert into finance_ai_connections(owner_id,provider,model,credential,key_suffix,request_limit,request_limit_enabled) values(u,'openai','fixture','fixture','test',1,false);
 insert into finance_ai_settings(owner_id,active_provider) values(u,'openai');insert into finance_ai_budgets values(u,1000000,5000000);
 r:=finance_ai_reserve(u,req,repeat('1',64),repeat('2',64),1000,6000,false,'openai','fixture');
 update finance_ai_receipt_runs set status='failed',response_cipher='encrypted-fixture-output' where id=(r->>'id')::uuid;
 update finance_ai_charges set state='settled',cost_micros=10,settled_at=now() where run_id=(r->>'id')::uuid;
 if not finance_ai_work_metered(u,req,now()) then raise exception 'Exact task charge was not recognized';end if;
 if finance_ai_work_metered(u,gen_random_uuid(),now()-interval '1 day') then raise exception 'Unrelated historical charge pinned a new task';end if;
 if finance_ai_work_metered(gen_random_uuid(),req,now()) then raise exception 'Metered task leaked across owners';end if;
 update finance_ai_budgets set daily_micros=0 where owner_id=u;
 r:=finance_ai_reserve(u,req,repeat('1',64),repeat('2',64),1000,6000,false,'openai','fixture');
 if r->>'status'<>'failed' or r->>'responseCipher'<>'encrypted-fixture-output' then raise exception 'Saved response was unavailable for zero-cost recovery';end if;
 if (select count(*) from finance_ai_charges where owner_id=u)<>1 then raise exception 'Recovery created another reservation';end if;
end;$$;
rollback;
