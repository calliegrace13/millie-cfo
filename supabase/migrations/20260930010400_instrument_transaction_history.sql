BEGIN;
-- Change one financial account's transaction defaults, independently of its
-- connector, bank balance, debt ownership, other accounts and visibility grants.
CREATE FUNCTION public.finance_transaction_history(_account uuid,_date date,_before numeric,_after numeric,_included boolean,_note text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();p uuid:=get_partner_user_id(auth.uid());balance_after numeric; BEGIN
 IF u IS NULL OR _date IS NULL OR NOT isfinite(_date) OR _date<='0001-01-01' OR _before IS NULL OR _before NOT IN (0,100) OR _after IS NULL OR _after<0 OR _after>100 OR _included IS NULL THEN RAISE EXCEPTION 'Choose one card or financial account, a valid date and split'; END IF;
 IF (_before<100 OR _after<100) AND p IS NULL THEN RAISE EXCEPTION 'Link your partner to attribute transactions to them'; END IF;
 PERFORM 1 FROM accounts WHERE id=_account AND user_id=u AND NOT coalesce(is_deleted,false) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose a financial account connected to your Millie profile'; END IF;
 -- A previous partner's balance interest must never silently be reassigned.
 IF EXISTS(SELECT 1 FROM finance_allocations WHERE account_id=_account AND effective_from<=_date AND coalesce(balance_pct,owner_pct)<100 AND partner_id IS DISTINCT FROM p) THEN RAISE EXCEPTION 'This account has balance ownership assigned to a different partner. Review that ownership before changing transaction history'; END IF;
 SELECT coalesce(balance_pct,owner_pct) INTO balance_after FROM finance_allocations WHERE account_id=_account AND effective_from<=_date ORDER BY effective_from DESC LIMIT 1;
 INSERT INTO finance_allocation_audit(owner_id,account_id,operation,rule)
 SELECT owner_id,account_id,'BEFORE_TRANSACTION_HISTORY',to_jsonb(r) FROM finance_allocations r WHERE account_id=_account AND effective_from<=_date;
 -- Retain each balance boundary and freeze legacy balance percentages before
 -- replacing transaction percentages. Rules after the sharing date survive.
 UPDATE finance_allocations SET balance_pct=coalesce(balance_pct,owner_pct),owner_pct=_before,partner_id=p,included=false,note='Before shared transactions: '||left(coalesce(_note,''),240)
 WHERE account_id=_account AND effective_from<_date;
 IF NOT EXISTS(SELECT 1 FROM finance_allocations WHERE account_id=_account AND effective_from='0001-01-01') THEN
 INSERT INTO finance_allocations(account_id,owner_id,partner_id,effective_from,owner_pct,balance_pct,included,note)
 VALUES(_account,u,p,'0001-01-01',_before,100,false,'Before shared transactions');
 END IF;
 INSERT INTO finance_allocations(account_id,owner_id,partner_id,effective_from,owner_pct,balance_pct,included,note)
 VALUES(_account,u,p,_date,_after,coalesce(balance_after,100),_included,'Shared transactions: '||left(coalesce(_note,''),240))
 ON CONFLICT(account_id,effective_from) DO UPDATE SET owner_pct=excluded.owner_pct,partner_id=excluded.partner_id,balance_pct=excluded.balance_pct,included=excluded.included,note=excluded.note;
END $$;
REVOKE ALL ON FUNCTION finance_transaction_history(uuid,date,numeric,numeric,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION finance_transaction_history(uuid,date,numeric,numeric,boolean,text) TO authenticated;
COMMIT;
