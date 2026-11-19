BEGIN;
CREATE OR REPLACE FUNCTION public.finance_end_arrangements(_date date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();p uuid:=get_partner_user_id(auth.uid()); a record; BEGIN
 IF u IS NULL OR _date IS NULL OR NOT isfinite(_date) OR _date<current_date THEN RAISE EXCEPTION 'Choose today or a future date'; END IF;
 FOR a IN SELECT id FROM accounts WHERE user_id=u AND NOT coalesce(is_deleted,false) ORDER BY id FOR UPDATE LOOP
  INSERT INTO finance_allocation_audit(owner_id,account_id,operation,rule) SELECT owner_id,account_id,'BEFORE_SEPARATION',to_jsonb(r) FROM finance_allocations r WHERE account_id=a.id AND effective_from>=_date;
  -- End only expense responsibility. Preserve existing recorded balance ownership.
  INSERT INTO finance_allocations(account_id,owner_id,partner_id,effective_from,owner_pct,balance_pct,included,note)
  SELECT a.id,u,r.partner_id,_date,100,coalesce(r.balance_pct,r.owner_pct),false,'Separate expenses; review balance ownership separately' FROM (SELECT * FROM finance_allocations WHERE account_id=a.id AND effective_from<=_date ORDER BY effective_from DESC LIMIT 1) r
  ON CONFLICT(account_id,effective_from) DO UPDATE SET owner_pct=100,balance_pct=excluded.balance_pct,included=false,note=excluded.note;
  UPDATE finance_allocations SET balance_pct=coalesce(balance_pct,owner_pct),owner_pct=100,included=false,note='Separate expenses; balance ownership retained' WHERE account_id=a.id AND effective_from>_date;
  DELETE FROM finance_category_splits WHERE account_id=a.id AND effective_from>=_date;
  INSERT INTO finance_category_splits(account_id,owner_id,partner_id,category,effective_from,owner_pct) SELECT a.id,u,p,category,_date,100 FROM finance_category_splits WHERE account_id=a.id GROUP BY category;
 END LOOP;
END $$;
COMMIT;
