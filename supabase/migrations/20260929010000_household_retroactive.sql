BEGIN;
-- Explicit historical correction; preserve every rule after the selected date.
CREATE OR REPLACE FUNCTION public.finance_retroactive(_accounts uuid[],_date date,_pct numeric,_included boolean,_note text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a uuid; u uuid:=auth.uid(); p uuid:=public.get_partner_user_id(auth.uid()); BEGIN
 IF u IS NULL OR _date IS NULL OR NOT isfinite(_date) OR _date>current_date OR _date<='0001-01-01' OR _pct IS NULL OR _pct<0 OR _pct>100 OR _included IS NULL OR coalesce(cardinality(_accounts),0)=0 THEN RAISE EXCEPTION 'Choose accounts, a past or current date, and a split from 0 to 100'; END IF;
 IF _pct<100 AND p IS NULL THEN RAISE EXCEPTION 'Link your partner before allocating a share to them'; END IF;
 FOR a IN SELECT DISTINCT unnest(_accounts) ORDER BY 1 LOOP
  PERFORM 1 FROM accounts WHERE id=a AND user_id=u AND NOT coalesce(is_deleted,false) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'You can change only your own active accounts'; END IF;
  -- Retain the old version as well as the new version when replacing a same-day rule.
  INSERT INTO finance_allocation_audit(owner_id,account_id,operation,rule)
   SELECT owner_id,account_id,'BEFORE_RETROACTIVE',to_jsonb(r) FROM finance_allocations r WHERE account_id=a AND effective_from=_date;
  INSERT INTO finance_allocations(account_id,owner_id,partner_id,effective_from,owner_pct,included,note)
   VALUES(a,u,p,_date,_pct,_included,'Historical correction: '||left(coalesce(_note,''),270))
   ON CONFLICT(account_id,effective_from) DO UPDATE SET partner_id=excluded.partner_id,owner_pct=excluded.owner_pct,included=excluded.included,note=excluded.note;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.finance_retroactive(uuid[],date,numeric,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_retroactive(uuid[],date,numeric,boolean,text) TO authenticated;
COMMIT;
