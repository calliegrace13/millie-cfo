DO $$
DECLARE
 owner uuid:=gen_random_uuid(); other_owner uuid:=gen_random_uuid();
 account uuid:=gen_random_uuid(); item uuid:=gen_random_uuid(); lease uuid:=gen_random_uuid();
 kept uuid; n integer; before_count integer; failed boolean;
 pending jsonb:=jsonb_build_object('transaction_id','pending','account_id','bank','name','Store','amount',25,'date','2026-11-01','pending',true,'category','Shopping');
 posted jsonb:=jsonb_build_object('transaction_id','posted','pending_transaction_id','pending','account_id','bank','name','Store','amount',25,'date','2026-11-02','pending',false,'category','Shopping');
BEGIN
 INSERT INTO accounts VALUES(account,owner,'bank',false,'My card');
 INSERT INTO plaid_items VALUES(item,owner,'saved');
 INSERT INTO millie_operations.sync_state VALUES(item,lease,now()+interval '5 minutes');
 n:=finance_apply_sync_page(item,lease,jsonb_build_array(pending),'[]','[]','first');
 IF n<>1 THEN RAISE EXCEPTION 'Initial import failed';END IF;
 SELECT id INTO kept FROM transactions WHERE plaid_transaction_id='pending';
 UPDATE transactions SET category='My category',classification_locked=true,notes='Keep my note' WHERE id=kept;
 INSERT INTO supporting_links VALUES(kept,'Receipt linked by user');
 n:=finance_apply_sync_page(item,lease,jsonb_build_array(pending),'[]','[]','replay');
 IF n<>0 OR (SELECT count(*) FROM transactions)<>1 THEN RAISE EXCEPTION 'Replay duplicated a transaction';END IF;
 n:=finance_apply_sync_page(item,lease,jsonb_build_array(posted),'[]','[{"transaction_id":"pending"}]','promoted');
 IF n<>0 OR NOT EXISTS(SELECT 1 FROM transactions t WHERE id=kept AND plaid_transaction_id='posted' AND NOT t.pending AND category='My category' AND notes='Keep my note') OR NOT EXISTS(SELECT 1 FROM supporting_links WHERE transaction_id=kept) THEN RAISE EXCEPTION 'Pending promotion lost identity or user work';END IF;
 PERFORM finance_apply_sync_page(item,lease,jsonb_build_array(posted||'{"transaction_id":"repeat","pending_transaction_id":null}'::jsonb),'[]','[]','repeat');
 IF (SELECT count(*) FROM transactions)<>2 THEN RAISE EXCEPTION 'Genuine identical-looking purchase was merged';END IF;
 INSERT INTO transactions(user_id,plaid_transaction_id,name) VALUES(other_owner,'private','Other owner');
 PERFORM finance_apply_sync_page(item,lease,'[]','[]','[{"transaction_id":"private"}]','scoped');
 IF NOT EXISTS(SELECT 1 FROM transactions WHERE user_id=other_owner) THEN RAISE EXCEPTION 'Cross-owner removal';END IF;
 SELECT count(*) INTO before_count FROM transactions;
 failed:=false;
 BEGIN
  PERFORM finance_apply_sync_page(item,lease,jsonb_build_array(posted||'{"transaction_id":"must-rollback"}'::jsonb,posted||'{"transaction_id":"bad-account","account_id":"unmapped"}'::jsonb),'[]','[]','must-not-advance');
 EXCEPTION WHEN OTHERS THEN failed:=true; END;
 IF NOT failed OR (SELECT count(*) FROM transactions)<>before_count OR (SELECT cursor FROM plaid_items WHERE id=item)<>'scoped' THEN RAISE EXCEPTION 'Failed batch changed ledger or cursor';END IF;
 UPDATE millie_operations.sync_state SET lease_until=now()-interval '1 minute' WHERE item_id=item;
 failed:=false;
 BEGIN PERFORM finance_apply_sync_page(item,lease,'[]','[]','[]','expired');EXCEPTION WHEN OTHERS THEN failed:=true;END;
 IF NOT failed OR (SELECT cursor FROM plaid_items WHERE id=item)<>'scoped' THEN RAISE EXCEPTION 'Expired lease committed';END IF;
END $$;
ROLLBACK;
