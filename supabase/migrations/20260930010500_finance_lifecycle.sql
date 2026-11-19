BEGIN;
CREATE TABLE finance_lifecycle_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL,partner_id uuid,phase text NOT NULL CHECK(phase IN ('single','sharing','merged')),effective_from date NOT NULL,entries jsonb NOT NULL,reset_categories boolean NOT NULL,scope_id uuid REFERENCES finance_documents(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE finance_lifecycle_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON finance_lifecycle_events FROM anon,authenticated;
GRANT SELECT ON finance_lifecycle_events TO authenticated;
GRANT ALL ON finance_lifecycle_events TO service_role;
CREATE POLICY "Private lifecycle change log" ON finance_lifecycle_events FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE FUNCTION finance_apply_lifecycle(_phase text,_date date,_entries jsonb,_reset_categories boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();p uuid:=get_partner_user_id(auth.uid());e jsonb;a uuid;r finance_allocations;bp numeric;ep numeric;scope uuid;result uuid;ids jsonb;BEGIN
 IF u IS NULL OR _phase IS NULL OR _phase NOT IN ('single','sharing','merged') OR _date IS NULL OR NOT isfinite(_date) OR _date<='0001-01-01' OR _entries IS NULL OR jsonb_typeof(_entries)<>'array' OR jsonb_array_length(_entries) NOT BETWEEN 1 AND 100 OR _reset_categories IS NULL THEN RAISE EXCEPTION 'Choose a phase, date and 1 to 100 financial accounts';END IF;
 IF _phase<>'single' AND p IS NULL THEN RAISE EXCEPTION 'Link your partner first';END IF;
 IF (SELECT count(DISTINCT value->>'account_id') FROM jsonb_array_elements(_entries))<>jsonb_array_length(_entries) THEN RAISE EXCEPTION 'Choose each financial account once';END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(_entries) ORDER BY value->>'account_id' LOOP
  a:=(e->>'account_id')::uuid;ep:=(e->>'expense_pct')::numeric;
  IF ep IS NULL OR ep<0 OR ep>100 OR (_phase='single' AND ep<>100) THEN RAISE EXCEPTION 'Invalid transaction split';END IF;
  PERFORM 1 FROM accounts WHERE id=a AND user_id=u AND NOT coalesce(is_deleted,false) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Each person must confirm their own connected accounts';END IF;
  IF EXISTS(SELECT 1 FROM finance_account_sharing WHERE account_id=a AND duplicate_of IS NOT NULL) THEN RAISE EXCEPTION 'Use primary financial accounts, not duplicate connections';END IF;
  SELECT * INTO r FROM finance_allocations WHERE account_id=a AND effective_from<=_date ORDER BY effective_from DESC LIMIT 1;
  -- Preview includes the rule it was based on. A concurrent change invalidates it.
  IF coalesce(e->>'expected_id','')<>coalesce(r.id::text,'') OR (r.id IS NOT NULL AND (e->>'expected_expense')::numeric IS DISTINCT FROM r.owner_pct) OR (r.id IS NOT NULL AND (e->>'expected_balance')::numeric IS DISTINCT FROM coalesce(r.balance_pct,r.owner_pct)) THEN RAISE EXCEPTION 'An arrangement changed after preview; reload and review again';END IF;
  bp:=coalesce((e->>'balance_pct')::numeric,r.balance_pct,r.owner_pct,100);
  IF bp<0 OR bp>100 OR (p IS NULL AND (ep<100 OR bp<100)) THEN RAISE EXCEPTION 'Invalid balance ownership or missing partner';END IF;
  IF coalesce(r.balance_pct,r.owner_pct,100)<100 AND r.partner_id IS DISTINCT FROM p AND e->>'balance_pct' IS NULL THEN RAISE EXCEPTION 'Review balance ownership from an earlier partnership explicitly';END IF;
  INSERT INTO finance_allocation_audit(owner_id,account_id,operation,rule) SELECT owner_id,account_id,'BEFORE_LIFECYCLE',to_jsonb(x) FROM finance_allocations x WHERE account_id=a AND effective_from=_date;
  INSERT INTO finance_allocations(account_id,owner_id,partner_id,effective_from,owner_pct,balance_pct,included,note)
  VALUES(a,u,p,_date,ep,bp,_phase<>'single','Lifecycle: '||_phase)
  ON CONFLICT(account_id,effective_from) DO UPDATE SET partner_id=excluded.partner_id,owner_pct=excluded.owner_pct,balance_pct=excluded.balance_pct,included=excluded.included,note=excluded.note;
  IF _reset_categories THEN
   INSERT INTO finance_allocation_audit(owner_id,account_id,operation,rule) SELECT owner_id,account_id,'CATEGORY_BEFORE_LIFECYCLE',to_jsonb(x) FROM finance_category_splits x WHERE account_id=a AND effective_from=_date;
   INSERT INTO finance_category_splits(account_id,owner_id,partner_id,category,effective_from,owner_pct)
   SELECT a,u,p,category,_date,ep FROM finance_category_splits WHERE account_id=a AND effective_from<=_date GROUP BY category
   ON CONFLICT(account_id,category,effective_from) DO UPDATE SET owner_pct=excluded.owner_pct,partner_id=excluded.partner_id;
  END IF;
 END LOOP;
 SELECT jsonb_agg(value->'account_id') INTO ids FROM jsonb_array_elements(_entries);
 INSERT INTO finance_documents(owner_id,kind,name,payload) VALUES(u,'scope',initcap(_phase)||' transition '||_date,jsonb_build_object('accountIds',ids,'effectiveFrom',_date,'phase',_phase)) RETURNING id INTO scope;
 INSERT INTO finance_lifecycle_events(owner_id,partner_id,phase,effective_from,entries,reset_categories,scope_id) VALUES(u,p,_phase,_date,_entries,_reset_categories,scope) RETURNING id INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION finance_apply_lifecycle(text,date,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION finance_apply_lifecycle(text,date,jsonb,boolean) TO authenticated;
COMMIT;
