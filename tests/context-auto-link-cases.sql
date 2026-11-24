create temp table f as select gen_random_uuid() owner,gen_random_uuid() other,gen_random_uuid() account,gen_random_uuid() other_account,gen_random_uuid() tx,gen_random_uuid() receipt,gen_random_uuid() item;
grant select on f to authenticated;
insert into auth.users select owner from f union all select other from f;
insert into accounts select account,owner,'My card','credit','USD',false from f union all select other_account,other,'Other card','credit','USD',false from f;
insert into finance_ai_policies select owner,'transactions','manual',array['receipts'] from f;
insert into plaid_items(id,user_id) select item,owner from f;
insert into transactions(id,user_id,account_id,name,date,amount,pending,category) select tx,owner,account,'Fixture Shop','2026-11-01',25,false,'Shopping' from f;
insert into transactions(user_id,account_id,name,date,amount,pending,category) select other,other_account,'Fixture Shop','2026-11-01',25,false,'Shopping' from f;
insert into finance_context_records(id,owner_id,kind,title,receipt) select receipt,owner,'receipt','Fixture Shop','{"merchant":"Fixture Shop","date":"2026-11-01","amount":25,"currency":"USD","items":[]}' from f;
do $$declare x f;before_ledger jsonb;n int;begin
 select * into x from f;select jsonb_agg(to_jsonb(t) order by id) into before_ledger from transactions t;
 if finance_auto_link_context_receipts_for_owner(x.owner)<>0 then raise exception 'Manual mode auto-linked';end if;
 update finance_ai_policies set mode='ai' where owner_id=x.owner;
 n:=finance_auto_link_context_receipts_for_owner(x.owner);
 if n<>1 or not exists(select 1 from finance_context_records where id=x.receipt and transaction_ids=array[x.tx] and link_source='automatic' and link_basis='merchant' and revision=2 and snapshots?x.tx::text) then raise exception 'Sole candidate did not auto-link with provenance';end if;
 if finance_auto_link_context_receipts_for_owner(x.owner)<>0 or (select count(*) from finance_context_history where record_id=x.receipt)<>2 then raise exception 'Replay created a new revision';end if;
 if (select jsonb_agg(to_jsonb(t) order by id) from transactions t) is distinct from before_ledger then raise exception 'Link changed the ledger';end if;
end;$$;
set local role authenticated;
do $$declare x f;blocked boolean;begin
 select * into x from f;perform set_config('request.jwt.claim.sub',x.other::text,true);
 if finance_auto_link_context_receipts()<>0 or exists(select 1 from finance_context_records where id=x.receipt) then raise exception 'Cross-owner access';end if;
 blocked:=false;begin perform finance_auto_link_context_receipts_for_owner(x.owner);exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'Private owner helper exposed';end if;
 perform set_config('request.jwt.claim.sub',x.owner::text,true);
 perform finance_save_context(x.receipt,2,'receipt','Fixture Shop','',null,null,'{}',false);
 if finance_auto_link_context_receipts()<>0 or not exists(select 1 from finance_context_records where id=x.receipt and auto_link_suppressed and transaction_ids='{}' and link_source='manual') then raise exception 'Undo relinked the receipt';end if;
 if exists(select 1 from finance_receipt_charge_links where transaction_id=x.tx) then raise exception 'Undo did not release the charge';end if;
 -- A replay of the original save after a timeout must not add another revision.
 perform finance_save_context(x.receipt,2,'receipt','Fixture Shop','',null,null,'{}',false);
 if (select revision from finance_context_records where id=x.receipt)<>3 then raise exception 'Undo replay failed';end if;
end;$$;
reset role;
-- Fresh cases share a helper, and do not expose a test-only production RPC.
create function pg_temp.receipt(_title text,_amount numeric,_currency text default 'USD',_date date default '2026-11-05') returns uuid language plpgsql as $$declare r uuid:=gen_random_uuid();begin
 insert into finance_context_records(id,owner_id,kind,title,receipt) select r,owner,'receipt',_title,jsonb_build_object('merchant',_title,'date',_date,'amount',_amount,'currency',_currency,'items','[]'::jsonb) from f;return r;end;$$;
create function pg_temp.purchase(_name text,_amount numeric,_pending boolean default false,_date date default '2026-11-05') returns uuid language plpgsql as $$declare t uuid:=gen_random_uuid();begin
 insert into transactions(id,user_id,account_id,name,date,amount,pending,category) select t,owner,account,_name,_date,_amount,_pending,'Shopping' from f;return t;end;$$;
do $$declare x f;r uuid;r2 uuid;t uuid;n int;run uuid;begin
 select * into x from f;
 r:=pg_temp.receipt('Different display name',30);t:=pg_temp.purchase('Bank description',30);
 n:=finance_auto_link_context_receipts_for_owner(x.owner);if n<>1 or not exists(select 1 from finance_context_records where id=r and transaction_ids=array[t] and link_basis='amount_date') then raise exception 'Sole amount/date option did not link: count %, row %',n,(select to_jsonb(z) from finance_context_records z where z.id=r);end if;
 r:=pg_temp.receipt('Repeated fare',3);perform pg_temp.purchase('Repeated fare',3);perform pg_temp.purchase('Repeated fare',3);
 if finance_auto_link_context_receipts_for_owner(x.owner)<>0 then raise exception 'Identical-looking separate purchases merged';end if;
 r:=pg_temp.receipt('Shared purchase',40);r2:=pg_temp.receipt('Shared purchase',40);perform pg_temp.purchase('Shared purchase',40);
 if finance_auto_link_context_receipts_for_owner(x.owner)<>0 then raise exception 'Competing receipts double-linked';end if;
 r:=pg_temp.receipt('Pending only',50);perform pg_temp.purchase('Pending only',50,true);
 if finance_auto_link_context_receipts_for_owner(x.owner)<>0 then raise exception 'Pending hold linked';end if;
 r:=pg_temp.receipt('Currency mismatch',60,'EUR');perform pg_temp.purchase('Currency mismatch',60);
 r:=pg_temp.receipt('Outside date',70);perform pg_temp.purchase('Outside date',70,false,'2026-11-16');
 if finance_auto_link_context_receipts_for_owner(x.owner)<>0 then raise exception 'Currency/date mismatch linked';end if;
 r:=pg_temp.receipt('Archived evidence',80);update finance_context_records set archived=true,revision=revision+1 where id=r;perform pg_temp.purchase('Archived evidence',80);
 if finance_auto_link_context_receipts_for_owner(x.owner)<>0 then raise exception 'Archived receipt linked';end if;
 r:=pg_temp.receipt('Previously resolved receipt',85);t:=pg_temp.purchase('Previously chosen charge',85);
 update finance_context_records set transaction_ids=array[t],revision=revision+1 where id=r;
 r:=pg_temp.receipt('New unique merchant',85);t:=pg_temp.purchase('New unique merchant',85);
 n:=finance_auto_link_context_receipts_for_owner(x.owner);
 if n<>1 or not exists(select 1 from finance_context_records where id=r and transaction_ids=array[t]) then raise exception 'A resolved receipt competed for an unrelated charge';end if;
 -- Capture a complete multi-receipt analysis before matching; no first-row win.
 perform pg_temp.purchase('Batch purchase',90);run:=gen_random_uuid();
 insert into finance_ai_receipt_runs values(run,x.owner,'succeeded','{"receipts":[{"merchant":"Batch purchase","date":"2026-11-05","amount":90,"currency":"USD","reference":"A","items":[]},{"merchant":"Batch purchase","date":"2026-11-05","amount":90,"currency":"USD","reference":"B","items":[]}]}');
 if exists(select 1 from finance_context_records where receipt->>'reference' in ('A','B') and cardinality(transaction_ids)>0) then raise exception 'Capture linked before checking the entire batch';end if;
 t:=pg_temp.purchase('Captured match',100);run:=gen_random_uuid();
 insert into finance_ai_receipt_runs values(run,x.owner,'succeeded','{"receipts":[{"merchant":"Captured match","date":"2026-11-05","amount":100,"currency":"USD","items":[]}]}');
 if not exists(select 1 from finance_context_records where title='Captured match' and transaction_ids=array[t] and link_source='automatic') then raise exception 'Receipt capture did not reconcile';end if;
 r:=pg_temp.receipt('Later bank import',110);t:=pg_temp.purchase('Later bank import',110);
 perform finance_apply_sync_page(x.item,gen_random_uuid(),'[]','[]','[]','test');
 if not exists(select 1 from finance_context_records where id=r and transaction_ids=array[t]) then raise exception 'Bank import did not reconcile';end if;
end;$$;
do $$declare x f;r uuid;other_receipt uuid;t uuid;n int;blocked boolean;begin
 select * into x from f;
 r:=pg_temp.receipt('Exact date',120);t:=pg_temp.purchase('Exact date',120);perform pg_temp.purchase('Exact date',120,false,'2026-11-06');
 n:=finance_auto_link_context_receipts_for_owner(x.owner);
 if n<>1 or not exists(select 1 from finance_context_records where id=r and transaction_ids=array[t] and link_rule='same_day') then raise exception 'Unique same-day option did not beat another date';end if;
 r:=pg_temp.receipt('Strong date',130);other_receipt:=pg_temp.receipt('Strong date',130,'USD','2026-11-06');t:=pg_temp.purchase('Strong date',130);
 n:=finance_auto_link_context_receipts_for_owner(x.owner);
 if n<>1 or not exists(select 1 from finance_context_records where id=r and transaction_ids=array[t]) or exists(select 1 from finance_context_records where id=other_receipt and cardinality(transaction_ids)>0) then raise exception 'Nearby receipt beat exact-date evidence or reused charge';end if;
 r:=pg_temp.receipt('Same-day tie',140);perform pg_temp.purchase('Same-day tie',140);perform pg_temp.purchase('Same-day tie',140);
 if finance_auto_link_context_receipts_for_owner(x.owner)<>0 then raise exception 'Two same-day charges were arbitrarily selected';end if;
 -- Manual commands and direct server writes are constrained too, even when the
 -- prior receipt is archived. Non-receipt context remains freely linkable.
 r:=pg_temp.receipt('Manual conflict',130);
 perform set_config('request.jwt.claim.sub',x.owner::text,true);
 blocked:=false;begin perform finance_save_context(r,1,'receipt','Manual conflict','',null,null,array[t],false);exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Manual command reused a charge';end if;
 update finance_context_records set archived=true,revision=revision+1 where id=(select record_id from finance_receipt_charge_links where transaction_id=t);
 blocked:=false;begin update finance_context_records set transaction_ids=array[t],revision=revision+1 where id=r;exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Archiving released a receipt claim';end if;
 perform finance_save_context(gen_random_uuid(),0,'purchase','Purchase context','',null,null,array[t],false);
 if (select count(*) from finance_receipt_charge_links where transaction_id=t)<>1 then raise exception 'Claim integrity failed';end if;
end;$$;
rollback;
