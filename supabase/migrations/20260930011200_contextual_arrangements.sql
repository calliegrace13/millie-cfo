BEGIN;
-- One atomic save for an account change, its explicit earlier-history correction,
-- and dated category exceptions. Existing bank records and access are untouched.
CREATE FUNCTION public.finance_save_arrangement_details(_date date,_entries jsonb,_phase text DEFAULT NULL,_reset_categories boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();p uuid:=get_partner_user_id(auth.uid());e jsonb;c jsonb;a uuid;r finance_allocations;actual jsonb;result uuid;original_note text;category_name text;
BEGIN
 IF u IS NULL OR _date IS NULL OR NOT isfinite(_date) OR _date<='0001-01-01' OR _entries IS NULL OR jsonb_typeof(_entries)<>'array' OR jsonb_array_length(_entries) NOT BETWEEN 1 AND 100 OR _reset_categories IS NULL THEN RAISE EXCEPTION 'Choose a date and accounts';END IF;
 IF _phase IS NOT NULL AND _phase NOT IN ('single','sharing','merged') THEN RAISE EXCEPTION 'Invalid phase';END IF;
 IF _phase IS NULL AND _reset_categories THEN RAISE EXCEPTION 'Category reset is only available in a lifecycle change';END IF;
 IF (SELECT count(DISTINCT value->>'account_id') FROM jsonb_array_elements(_entries))<>jsonb_array_length(_entries) THEN RAISE EXCEPTION 'Choose each account once';END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(_entries) ORDER BY value->>'account_id' LOOP
  a:=(e->>'account_id')::uuid;
  PERFORM 1 FROM accounts WHERE id=a AND user_id=u AND (NOT coalesce(is_deleted,false) OR id IN(SELECT original_id FROM finance_account_continuity)) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the account owner can edit this change';END IF;
  IF EXISTS(SELECT 1 FROM finance_account_sharing WHERE account_id=a AND duplicate_of IS NOT NULL) THEN RAISE EXCEPTION 'Edit the primary account';END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'effective_from',effective_from,'owner_pct',owner_pct,'balance_pct',balance_pct,'included',included,'partner_id',partner_id,'note',note) ORDER BY id),'[]') INTO actual FROM finance_allocations WHERE account_id=a AND effective_from<=_date;
  IF e->'expected_history' IS DISTINCT FROM actual THEN RAISE EXCEPTION 'Account history changed after preview; reload and review again';END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'category',category,'effective_from',effective_from,'owner_pct',owner_pct,'partner_id',partner_id) ORDER BY id),'[]') INTO actual FROM finance_category_splits WHERE account_id=a;
  IF e->'expected_categories' IS DISTINCT FROM actual THEN RAISE EXCEPTION 'Category rules changed after preview; reload and review again';END IF;
  IF e->>'expense_pct' IS NULL OR (e->>'expense_pct')::numeric NOT BETWEEN 0 AND 100 OR ((e->>'expense_pct')::numeric<100 AND p IS NULL) THEN RAISE EXCEPTION 'Invalid expense share';END IF;
  IF e->>'before_pct' IS NOT NULL AND ((e->>'before_pct')::numeric NOT IN(0,100) OR ((e->>'before_pct')::numeric=0 AND p IS NULL)) THEN RAISE EXCEPTION 'Invalid earlier ownership';END IF;
  IF e->'category_overrides' IS NULL OR jsonb_typeof(e->'category_overrides')<>'array' OR jsonb_array_length(e->'category_overrides')>100 THEN RAISE EXCEPTION 'Invalid category edits';END IF;
  IF (SELECT count(DISTINCT lower(trim(value->>'category'))) FROM jsonb_array_elements(e->'category_overrides'))<>jsonb_array_length(e->'category_overrides') THEN RAISE EXCEPTION 'Choose each category once';END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(e->'category_overrides') LOOP
   IF c->>'category' IS NULL OR length(trim(c->>'category')) NOT BETWEEN 1 AND 100 OR c->>'pct' IS NULL OR (c->>'pct')::numeric NOT BETWEEN 0 AND 100 OR ((c->>'pct')::numeric<100 AND p IS NULL) THEN RAISE EXCEPTION 'Invalid category share';END IF;
  END LOOP;
  IF _phase IS NULL THEN
   SELECT * INTO r FROM finance_allocations WHERE account_id=a AND effective_from=_date;
   IF NOT FOUND OR r.partner_id IS DISTINCT FROM p THEN RAISE EXCEPTION 'Select a saved event for your current partnership';END IF;
  END IF;
 END LOOP;
 IF _phase IS NOT NULL THEN result:=finance_apply_lifecycle(_phase,_date,_entries,_reset_categories);END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(_entries) ORDER BY value->>'account_id' LOOP
  a:=(e->>'account_id')::uuid;
  SELECT * INTO r FROM finance_allocations WHERE account_id=a AND effective_from=_date;
  original_note:=r.note;
  IF _phase IS NULL THEN
   UPDATE finance_allocations SET owner_pct=(e->>'expense_pct')::numeric,balance_pct=coalesce(balance_pct,owner_pct) WHERE id=r.id;
  END IF;
  IF e->>'before_pct' IS NOT NULL THEN
   PERFORM finance_transaction_history(a,_date,(e->>'before_pct')::numeric,(e->>'expense_pct')::numeric,r.included,r.note);
   UPDATE finance_allocations SET note=original_note WHERE account_id=a AND effective_from=_date;
  END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(e->'category_overrides') LOOP
   SELECT category INTO category_name FROM finance_category_splits WHERE account_id=a AND lower(category)=lower(trim(c->>'category')) ORDER BY effective_from DESC LIMIT 1;
   category_name:=coalesce(category_name,trim(c->>'category'));
   INSERT INTO finance_allocation_audit(owner_id,account_id,operation,rule) SELECT owner_id,account_id,'CATEGORY_BEFORE_CONTEXT_EDIT',to_jsonb(x) FROM finance_category_splits x WHERE account_id=a AND category=category_name AND effective_from=_date;
   PERFORM finance_category_split(a,category_name,_date,(c->>'pct')::numeric);
  END LOOP;
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION finance_save_arrangement_details(date,jsonb,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION finance_save_arrangement_details(date,jsonb,text,boolean) TO authenticated;
COMMIT;
