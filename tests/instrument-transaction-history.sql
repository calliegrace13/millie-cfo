BEGIN;
CREATE TEMP TABLE instrument_fixture AS SELECT user_id owner_id,partner_user_id partner_id,gen_random_uuid() mine_card,gen_random_uuid() partner_card,gen_random_uuid() savings,gen_random_uuid() investment FROM partner_links WHERE status='active' LIMIT 1;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM instrument_fixture) THEN RAISE EXCEPTION 'Active pair required';END IF;END $$;
GRANT SELECT ON instrument_fixture TO authenticated;
INSERT INTO accounts(id,user_id,name,type,current_balance,currency)
 SELECT mine_card,owner_id,'Mine card fixture','credit',1000,'USD' FROM instrument_fixture UNION ALL
 SELECT partner_card,owner_id,'Partner-origin card fixture','credit',2000,'USD' FROM instrument_fixture UNION ALL
 SELECT savings,owner_id,'Savings fixture','savings',3000,'USD' FROM instrument_fixture UNION ALL
 SELECT investment,owner_id,'Investment fixture','investment',4000,'USD' FROM instrument_fixture;
INSERT INTO transactions(user_id,account_id,name,amount,date,category) SELECT owner_id,mine_card,'Before fixture',100,current_date-60,'Shopping' FROM instrument_fixture UNION ALL SELECT owner_id,partner_card,'After fixture',200,current_date,'Shopping' FROM instrument_fixture;
-- Legacy balance percentages must be frozen before transaction defaults change.
UPDATE finance_allocations SET owner_pct=80,balance_pct=NULL,partner_id=(SELECT partner_id FROM instrument_fixture) WHERE account_id=(SELECT partner_card FROM instrument_fixture);
SET LOCAL ROLE authenticated;
DO $$ DECLARE f record;blocked boolean; BEGIN
 SELECT * INTO f FROM instrument_fixture;PERFORM set_config('request.jwt.claim.sub',f.owner_id::text,true);
 PERFORM finance_schedule(ARRAY[f.mine_card],current_date+60,70,true,'Future split');
 PERFORM finance_transaction_history(f.mine_card,current_date-30,100,50,true,'Mine then shared');
 PERFORM finance_transaction_history(f.partner_card,current_date-30,0,50,true,'Partner then shared');
 IF (SELECT owner_pct FROM finance_allocations WHERE account_id=f.mine_card AND effective_from='0001-01-01')<>100 THEN RAISE EXCEPTION 'Mine before history lost';END IF;
 IF (SELECT owner_pct FROM finance_allocations WHERE account_id=f.partner_card AND effective_from='0001-01-01')<>0 THEN RAISE EXCEPTION 'Partner before history lost';END IF;
 IF EXISTS(SELECT 1 FROM finance_allocations WHERE account_id IN(f.mine_card,f.partner_card) AND effective_from=current_date-30 AND owner_pct<>50) THEN RAISE EXCEPTION 'Shared phase incorrect';END IF;
 IF EXISTS(SELECT 1 FROM finance_allocations WHERE account_id=f.partner_card AND balance_pct<>80) THEN RAISE EXCEPTION 'Partner card balance percentages changed';END IF;
 IF EXISTS(SELECT 1 FROM finance_allocations WHERE account_id=f.mine_card AND balance_pct<>100) THEN RAISE EXCEPTION 'Mine card balance percentages changed';END IF;
 IF (SELECT owner_pct FROM finance_allocations WHERE account_id=f.mine_card AND effective_from=current_date+60)<>70 THEN RAISE EXCEPTION 'Future split overwritten';END IF;
 IF (SELECT count(*) FROM finance_allocations WHERE account_id IN(f.savings,f.investment))<>2 OR EXISTS(SELECT 1 FROM finance_allocations WHERE account_id IN(f.savings,f.investment) AND owner_pct<>100) THEN RAISE EXCEPTION 'Other financial accounts affected';END IF;
 IF EXISTS(SELECT 1 FROM accounts WHERE id IN(f.mine_card,f.partner_card,f.savings,f.investment) AND user_id<>f.owner_id) THEN RAISE EXCEPTION 'Connector changed';END IF;
 IF (SELECT current_balance FROM accounts WHERE id=f.partner_card)<>2000 OR (SELECT sum(amount) FROM transactions WHERE account_id IN(f.mine_card,f.partner_card))<>300 THEN RAISE EXCEPTION 'Bank data changed';END IF;
 IF EXISTS(SELECT 1 FROM finance_account_sharing WHERE account_id IN(f.mine_card,f.partner_card) AND enabled) THEN RAISE EXCEPTION 'Access unexpectedly granted';END IF;
 PERFORM finance_transaction_history(f.savings,current_date-20,100,40,true,'Savings');
 PERFORM finance_transaction_history(f.investment,current_date-10,0,60,true,'Investment');
 IF EXISTS(SELECT 1 FROM finance_allocations WHERE account_id IN(f.savings,f.investment) AND balance_pct<>100) THEN RAISE EXCEPTION 'Savings/investment balance ownership changed';END IF;
 PERFORM finance_transaction_history(f.partner_card,current_date-30,0,75,true,'Same-date correction');
 IF (SELECT balance_pct FROM finance_allocations WHERE account_id=f.partner_card AND effective_from=current_date-30)<>80 THEN RAISE EXCEPTION 'Same-date correction changed balance';END IF;
 IF NOT EXISTS(SELECT 1 FROM finance_allocation_audit WHERE account_id=f.partner_card AND operation='BEFORE_TRANSACTION_HISTORY' AND rule->>'owner_pct'='50') THEN RAISE EXCEPTION 'Old split not audited';END IF;
 PERFORM set_config('request.jwt.claim.sub',f.partner_id::text,true);
 blocked:=false;BEGIN PERFORM finance_transaction_history(f.mine_card,current_date,0,50,true,'Unauthorized');EXCEPTION WHEN raise_exception THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Partner changed someone else’s connected instrument';END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: individual mine/partner-origin cards, savings and investments; independent histories; balances, raw transactions, connector and access preserved; future rules retained; same-date audit and owner-only edits. Fixtures rolled back.' AS result;
