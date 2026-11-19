begin;
do $$
declare u uuid; item uuid; acct uuid; lease uuid; before_count integer; after_count integer;
begin
 select id into u from auth.users limit 1;
 insert into public.plaid_items(user_id,item_id,access_token) values(u,'test-operations-'||gen_random_uuid(),'enc:test') returning id into item;
 insert into public.accounts(user_id,name,type,currency,is_manual,plaid_account_id) values(u,'Rollback test','checking','USD',false,'test-account-'||item) returning id into acct;
 lease:=public.finance_sync_claim(item);
 if lease is null or public.finance_sync_claim(item) is not null then raise exception 'Lease isolation failed';end if;
 perform public.finance_apply_sync_page(item,lease,jsonb_build_array(jsonb_build_object('account_id','test-account-'||item,'transaction_id','test-one-'||item,'name','Same purchase','amount',10,'date','2026-09-01','pending',false,'category','Other'),jsonb_build_object('account_id','test-account-'||item,'transaction_id','test-two-'||item,'name','Same purchase','amount',10,'date','2026-09-01','pending',false,'category','Other')),'[]','[]','cursor-one');
 select count(*) into before_count from public.transactions where account_id=acct;
 if before_count<>2 then raise exception 'Distinct purchases dropped';end if;
 perform public.finance_apply_sync_page(item,lease,jsonb_build_array(jsonb_build_object('account_id','test-account-'||item,'transaction_id','test-one-'||item,'name','Same purchase','amount',10,'date','2026-09-01','pending',false,'category','Other')),'[]','[]','cursor-one');
 select count(*) into after_count from public.transactions where account_id=acct;
 if after_count<>before_count then raise exception 'Replay duplicated transactions';end if;
 begin
  perform public.finance_apply_sync_page(item,lease,jsonb_build_array(jsonb_build_object('account_id','missing','transaction_id','bad','name','bad','amount',1,'date','2026-09-01','pending',false)),'[]','[]','bad-cursor');
  raise exception 'Missing account accepted';
 exception when others then if SQLERRM='Missing account accepted' then raise;end if;end;
 if (select cursor from public.plaid_items where id=item)<>'cursor-one' then raise exception 'Cursor advanced after failure';end if;
 perform public.finance_sync_finish(item,lease,'Test failure');
 if (select succeeded_at from millie_operations.sync_state where item_id=item) is not null then raise exception 'Failure reported success';end if;
 if not exists(select 1 from public.notifications where user_id=u and reference_id=item::text and type='sync_failure') then raise exception 'No failure alert';end if;
 lease:=public.finance_sync_claim(item);perform public.finance_sync_finish(item,lease,null);
 if (select succeeded_at from millie_operations.sync_state where item_id=item) is null then raise exception 'Success missing';end if;
 if has_function_privilege('authenticated','public.finance_sync_claim(uuid)','EXECUTE') or has_function_privilege('anon','public.finance_scheduler_authorized(text)','EXECUTE') or has_schema_privilege('authenticated','millie_operations','USAGE') then raise exception 'Private operations exposed';end if;
end $$;
rollback;
select 'PASS: leases, distinct purchases, replay, cursor rollback, failure alerts, privileges; all fixtures rolled back' as result;
