BEGIN;
CREATE TEMP TABLE ci AS SELECT user_id u,partner_user_id p,gen_random_uuid() a,gen_random_uuid() b,gen_random_uuid() x,gen_random_uuid() y,gen_random_uuid() z FROM partner_links WHERE status='active' LIMIT 1;
GRANT SELECT ON ci TO authenticated,service_role;
INSERT INTO accounts(id,user_id,name,type,currency) SELECT a,u,'Classifier bank','checking','USD' FROM ci UNION ALL SELECT b,u,'Classifier card','credit','USD' FROM ci;
INSERT INTO transactions(id,user_id,account_id,name,date,amount,category,classification_source,needs_review) SELECT x,u,a,'Credit card payment',current_date,500,'Bills & Utilities','auto',true FROM ci UNION ALL SELECT y,u,b,'Payment thank you',current_date,-500,'Income','auto',true FROM ci UNION ALL SELECT z,u,b,'Starbucks',current_date,6,'Shopping','auto',true FROM ci;
UPDATE transactions SET merchant_name='Starbucks' WHERE id IN(SELECT z FROM ci);
CREATE FUNCTION pg_temp.proposal(t transactions,cat text,k text,match uuid DEFAULT null) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('id',t.id,'category',cat,'kind',k,'confidence',.97,'reason','Test classification','review',false,'version','1.0','merchant_key','merchant:starbucks','match_id',match,'expected',jsonb_build_object('amount',t.amount,'date',t.date,'account_id',t.account_id,'category',t.category,'updated_at',t.updated_at,'linked_transfer_id',t.linked_transfer_id)) $$;
-- Exercise metadata retention and pending-to-posted correction protection through the real sync wrapper.
DO $$ DECLARE u uuid;item uuid;acct uuid;lease uuid;tid uuid;payload jsonb;BEGIN
 SELECT ci.u INTO u FROM ci;
 INSERT INTO plaid_items(user_id,item_id,access_token) VALUES(u,'classifier-test-'||gen_random_uuid(),'enc:test') RETURNING id INTO item;
 INSERT INTO accounts(user_id,name,type,currency,is_manual,plaid_account_id) VALUES(u,'Classifier import','checking','USD',false,'classifier-account-'||item) RETURNING id INTO acct;
 lease:=finance_sync_claim(item);payload:=jsonb_build_object('account_id','classifier-account-'||item,'transaction_id','pending-'||item,'name','Coffee','merchant_name','Starbucks','amount',6,'date',current_date,'pending',true,'category','Other','provider_metadata',jsonb_build_object('primary','FOOD_AND_DRINK','confidence','HIGH','merchant_entity_id','coffee-entity'));
 PERFORM finance_apply_sync_page(item,lease,jsonb_build_array(payload),'[]','[]','one');
 SELECT id INTO tid FROM transactions WHERE account_id=acct;
 IF (SELECT classification_locked OR classification_source<>'auto' OR provider_metadata->>'merchant_entity_id'<>'coffee-entity' FROM transactions WHERE id=tid) THEN RAISE EXCEPTION 'New import metadata/source failed';END IF;
 UPDATE transactions SET category='My coffee',classification_source='user',classification_locked=true WHERE id=tid;
 payload:=payload||jsonb_build_object('transaction_id','posted-'||item,'pending_transaction_id','pending-'||item,'pending',false);
 PERFORM finance_apply_sync_page(item,lease,jsonb_build_array(payload),'[]','[]','two');
 IF (SELECT count(*) FROM transactions WHERE account_id=acct)<>1 OR (SELECT category FROM transactions WHERE id=tid)<>'My coffee' OR (SELECT pending FROM transactions WHERE id=tid) THEN RAISE EXCEPTION 'Pending correction lost or duplicated';END IF;
END $$;
SET LOCAL ROLE service_role;
DO $$ DECLARE f record;changes jsonb;blocked boolean;BEGIN
 SELECT * INTO f FROM ci;PERFORM set_config('request.jwt.claim.role','service_role',true);
 SELECT jsonb_agg(pg_temp.proposal(t,'Credit Card Payment','card_payment',CASE WHEN t.id=f.x THEN f.y ELSE f.x END)) INTO changes FROM transactions t WHERE id IN(f.x,f.y);
 blocked:=false;BEGIN PERFORM finance_apply_classifications(f.u,jsonb_build_array(changes->0),true);EXCEPTION WHEN raise_exception THEN blocked:=true;END;IF NOT blocked THEN RAISE EXCEPTION 'Incomplete pair accepted';END IF;
 PERFORM finance_apply_classifications(f.u,changes,true);
 IF (SELECT linked_transfer_id FROM transactions WHERE id=f.x)<>f.y OR (SELECT linked_transfer_id FROM transactions WHERE id=f.y)<>f.x THEN RAISE EXCEPTION 'Pair not atomic';END IF;
 blocked:=false;BEGIN PERFORM finance_apply_classifications(f.u,changes,true);EXCEPTION WHEN raise_exception THEN blocked:=true;END;IF NOT blocked THEN RAISE EXCEPTION 'Stale preview accepted';END IF;
END $$;
RESET ROLE;SET LOCAL ROLE authenticated;
DO $$ DECLARE f record;blocked boolean;BEGIN
 SELECT * INTO f FROM ci;PERFORM set_config('request.jwt.claim.role','authenticated',true);PERFORM set_config('request.jwt.claim.sub',f.p::text,true);
 blocked:=false;BEGIN PERFORM finance_correct_category(f.z,'Food & Dining',true);EXCEPTION WHEN raise_exception THEN blocked:=true;END;IF NOT blocked THEN RAISE EXCEPTION 'Other user changed category';END IF;
 blocked:=false;BEGIN PERFORM finance_apply_classifications(f.u,'[]',true);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;IF NOT blocked THEN RAISE EXCEPTION 'Client invoked service classification';END IF;
 PERFORM set_config('request.jwt.claim.sub',f.u::text,true);
 INSERT INTO transactions(user_id,account_id,name,date,amount,category,needs_review) VALUES(f.u,f.a,'Manual unknown fixture',current_date,1,'Other',true);
 IF EXISTS(SELECT 1 FROM transactions WHERE user_id=f.u AND name='Manual unknown fixture' AND classification_locked) THEN RAISE EXCEPTION 'Uncategorized manual import locked';END IF;
 PERFORM finance_correct_category(f.z,'Food & Dining',true);
 IF NOT(SELECT classification_locked FROM transactions WHERE id=f.z) OR (SELECT category FROM finance_merchant_preferences WHERE owner_id=f.u AND merchant_key='merchant:starbucks')<>'Food & Dining' THEN RAISE EXCEPTION 'Correction/preference not saved';END IF;
END $$;
RESET ROLE;SET LOCAL ROLE service_role;
DO $$ DECLARE f record;c jsonb;blocked boolean;BEGIN SELECT * INTO f FROM ci;PERFORM set_config('request.jwt.claim.role','service_role',true);SELECT pg_temp.proposal(t,'Shopping','expense') INTO c FROM transactions t WHERE id=f.z;blocked:=false;BEGIN PERFORM finance_apply_classifications(f.u,jsonb_build_array(c),true);EXCEPTION WHEN raise_exception THEN blocked:=true;END;IF NOT blocked THEN RAISE EXCEPTION 'User correction overwritten';END IF;END $$;
RESET ROLE;ROLLBACK;
SELECT 'PASS: reciprocal atomic links, stale/incomplete preview rejection, owner isolation, service-only automation, private merchant learning and correction protection; fixtures rolled back.' AS result;
