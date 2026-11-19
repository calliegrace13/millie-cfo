BEGIN;
CREATE OR REPLACE FUNCTION public.finance_schedule(_accounts uuid[],_date date,_pct numeric,_included boolean,_note text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a uuid; u uuid:=auth.uid(); p uuid:=public.get_partner_user_id(auth.uid()); BEGIN
 IF u IS NULL OR _date IS NULL OR _date<current_date OR _pct IS NULL OR _pct<0 OR _pct>100 OR _included IS NULL OR coalesce(cardinality(_accounts),0)=0 THEN RAISE EXCEPTION 'Choose accounts, today or a future date, and a split from 0 to 100'; END IF;
 IF _pct<100 AND p IS NULL THEN RAISE EXCEPTION 'Link your partner before allocating a share to them'; END IF;
 FOREACH a IN ARRAY _accounts LOOP
  PERFORM 1 FROM accounts WHERE id=a AND user_id=u FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'You can change only your own accounts'; END IF;
  INSERT INTO finance_allocations(account_id,owner_id,partner_id,effective_from,owner_pct,included,note)
  VALUES(a,u,p,_date,_pct,_included,left(coalesce(_note,''),300));
 END LOOP;
END $$;
COMMIT;
