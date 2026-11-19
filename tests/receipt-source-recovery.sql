begin;
do $$
declare u uuid:=gen_random_uuid(); k text:=repeat('a',43); k2 text:=repeat('b',43); reservation jsonb; already boolean:=false;
begin
 insert into auth.users(id,email) values(u,'receipt-fixture-'||u::text||'@example.invalid');
 insert into finance_ai_settings(owner_id,active_provider) values(u,'openai');
 insert into finance_ai_connections(owner_id,provider,model,credential,key_suffix,request_limit) values(u,'openai','gpt-4.1-mini',repeat('x',80),'test',3);
 reservation:=finance_reserve_receipt_sources(u,gen_random_uuid(),repeat('a',64),repeat('b',64),500,100,false,'openai','gpt-4.1-mini',array[k,k2]);
 if reservation->>'status'<>'new' or (select count(*) from finance_receipt_source_history(u,array[k,k2]) where state='running')<>2 then raise exception 'Missing source reservation';end if;
 begin perform finance_reserve_receipt_sources(u,gen_random_uuid(),repeat('d',64),repeat('c',64),500,100,false,'openai','gpt-4.1-mini',array[k2]);exception when others then if sqlerrm like 'Receipt history changed%' then already:=true;else raise;end if;end;
 if not already then raise exception 'Duplicate reservation accepted';end if;
 update finance_ai_receipt_runs set status='succeeded',result='{"receipts":[{"source":1,"merchant":"Test"}],"issues":[{"source":0,"reason":"Unclear date"}]}' where id=(reservation->>'id')::uuid;
 if (select jsonb_array_length(receipts) from finance_receipt_source_history(u,array[k2]))<>1 or (select jsonb_array_length(issues) from finance_receipt_source_history(u,array[k]))<>1 then raise exception 'Source indexing leaked a sibling';end if;
 if exists(select 1 from finance_receipt_source_history(gen_random_uuid(),array[k2])) then raise exception 'Owner boundary failed';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform finance_record_receipt_exceptions(u,jsonb_build_array(jsonb_build_object('key',k,'name','Fixture','reason','Unclear date')));
 if (select count(*) from finance_receipt_review_queue())<>1 then raise exception 'Missing review';end if;
 perform finance_finish_receipt_review(k);
 perform finance_record_receipt_exceptions(u,jsonb_build_array(jsonb_build_object('key',k,'name','Fixture','reason','Unclear date')));
 if exists(select 1 from finance_receipt_review_queue()) then raise exception 'Closed question reopened';end if;
 if has_function_privilege('authenticated','finance_receipt_source_history(uuid,text[])','execute') then raise exception 'Cross-owner history accessible';end if;
end;$$;
select 'Passed source reservation, overlap rejection, individual saved results, owner privacy and durable dismissal' as result;
rollback;
