BEGIN;
CREATE FUNCTION finance_share_household_accounts(_accounts uuid[],_from date,_partner uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();p uuid;a uuid;root uuid;r finance_allocations;existing finance_account_sharing;n integer:=0;BEGIN
 PERFORM pg_advisory_xact_lock(621409126);
 p:=get_partner_user_id(u);
 IF u IS NULL OR p IS NULL OR p IS DISTINCT FROM _partner OR _from IS NULL OR NOT isfinite(_from) OR coalesce(cardinality(_accounts),0) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Review your linked partner, accounts and history date again';END IF;
 IF (SELECT count(DISTINCT x) FROM unnest(_accounts) x)<>cardinality(_accounts) THEN RAISE EXCEPTION 'Choose each account once';END IF;
 FOREACH a IN ARRAY (SELECT array_agg(x ORDER BY x) FROM unnest(_accounts) x) LOOP
  PERFORM 1 FROM accounts WHERE id=a AND user_id=u FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only your connected accounts can be shared';END IF;
  SELECT original_id INTO root FROM finance_account_continuity WHERE source_id=a AND starts_on<=current_date;
  root:=coalesce(root,a);
  SELECT * INTO r FROM finance_allocations WHERE account_id=root AND effective_from<=current_date ORDER BY effective_from DESC LIMIT 1;
  IF NOT coalesce(r.included,false) OR (r.partner_id IS NOT NULL AND r.partner_id<>p) THEN RAISE EXCEPTION 'An account is no longer shared in this household; reload the preview';END IF;
  SELECT * INTO existing FROM finance_account_sharing WHERE account_id=a;
  IF existing.duplicate_of IS NOT NULL OR EXISTS(SELECT 1 FROM finance_account_sharing WHERE account_id=root AND duplicate_of IS NOT NULL) THEN RAISE EXCEPTION 'Duplicate accounts must be reviewed individually';END IF;
  INSERT INTO finance_account_sharing(account_id,owner_id,recipient_id,history_from,enabled)
  VALUES(a,u,p,CASE WHEN existing.enabled AND existing.recipient_id=p THEN least(existing.history_from,_from) ELSE _from END,true)
  ON CONFLICT(account_id) DO UPDATE SET recipient_id=excluded.recipient_id,history_from=excluded.history_from,enabled=true,updated_at=now();n:=n+1;
 END LOOP;RETURN n;
END $$;
REVOKE ALL ON FUNCTION finance_share_household_accounts(uuid[],date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION finance_share_household_accounts(uuid[],date,uuid) TO authenticated;
COMMIT;
