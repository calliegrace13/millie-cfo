BEGIN;
CREATE TABLE finance_review_batches(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL,entries jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),undone_at timestamptz);
ALTER TABLE finance_review_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON finance_review_batches FROM anon,authenticated;
GRANT SELECT ON finance_review_batches TO authenticated;
GRANT ALL ON finance_review_batches TO service_role;
CREATE POLICY "Own review batches" ON finance_review_batches FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE FUNCTION finance_review_fields(t transactions) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_object('category',t.category,'cash_flow_type',t.cash_flow_type,'is_one_time_expense',t.is_one_time_expense,'income_type',t.income_type); $$;
CREATE FUNCTION finance_apply_review(_entries jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e jsonb;t transactions; patches jsonb:='[]';old jsonb;next jsonb;result uuid; BEGIN
 IF auth.uid() IS NULL OR jsonb_typeof(_entries)<>'array' OR jsonb_array_length(_entries) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Review 1 to 500 transactions at a time'; END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(_entries) ORDER BY value->>'id' LOOP
  SELECT * INTO t FROM transactions WHERE id=(e->>'id')::uuid AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'You can review only your transactions'; END IF;
  old:=finance_review_fields(t);
  IF old IS DISTINCT FROM e->'expected' THEN RAISE EXCEPTION 'A transaction changed after preview. Reload before applying'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(e->'patch') k WHERE k NOT IN ('category','cash_flow_type','is_one_time_expense','income_type')) THEN RAISE EXCEPTION 'Unsupported edit'; END IF;
  next:=old||(e->'patch');
  UPDATE transactions SET category=next->>'category',cash_flow_type=(next->>'cash_flow_type')::cash_flow_category,is_one_time_expense=(next->>'is_one_time_expense')::boolean,income_type=next->>'income_type' WHERE id=t.id;
  patches:=patches||jsonb_build_array(jsonb_build_object('id',t.id,'before',old,'after',next));
 END LOOP;
 INSERT INTO finance_review_batches(owner_id,entries) VALUES(auth.uid(),patches) RETURNING id INTO result;RETURN result;
END $$;
CREATE FUNCTION finance_undo_review(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b finance_review_batches;e jsonb;t transactions;v jsonb; BEGIN
 SELECT * INTO b FROM finance_review_batches WHERE id=_id AND owner_id=auth.uid() AND undone_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Review batch unavailable'; END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(b.entries) ORDER BY value->>'id' LOOP
  SELECT * INTO t FROM transactions WHERE id=(e->>'id')::uuid AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR finance_review_fields(t) IS DISTINCT FROM e->'after' THEN RAISE EXCEPTION 'A later edit exists; undo would overwrite it'; END IF;
  v:=e->'before';UPDATE transactions SET category=v->>'category',cash_flow_type=(v->>'cash_flow_type')::cash_flow_category,is_one_time_expense=(v->>'is_one_time_expense')::boolean,income_type=v->>'income_type' WHERE id=t.id;
 END LOOP;
 UPDATE finance_review_batches SET undone_at=now() WHERE id=_id;
END $$;
REVOKE ALL ON FUNCTION finance_review_fields(transactions),finance_apply_review(jsonb),finance_undo_review(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION finance_apply_review(jsonb),finance_undo_review(uuid) TO authenticated;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS import_key text;
CREATE UNIQUE INDEX finance_import_key ON transactions(user_id,import_key) WHERE import_key IS NOT NULL;
CREATE FUNCTION finance_import_statement(_account uuid,_rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e jsonb;n integer:=0;c integer; BEGIN
 PERFORM 1 FROM accounts WHERE id=_account AND user_id=auth.uid() AND NOT coalesce(is_deleted,false) FOR UPDATE;
 IF NOT FOUND OR jsonb_typeof(_rows)<>'array' OR jsonb_array_length(_rows)>500 THEN RAISE EXCEPTION 'Choose your account and at most 500 rows'; END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(_rows) LOOP
  IF (e->>'date')::date IS NULL OR NOT isfinite((e->>'date')::date) OR coalesce(length(e->>'name'),0) NOT BETWEEN 1 AND 300 OR (e->>'amount')::numeric IS NULL OR (e->>'amount')::numeric::text IN ('NaN','Infinity','-Infinity') OR coalesce(length(e->>'key'),0)<>64 THEN RAISE EXCEPTION 'Invalid statement row'; END IF;
  INSERT INTO transactions(user_id,account_id,name,amount,date,category,pending,needs_review,cash_flow_type,import_key) VALUES(auth.uid(),_account,e->>'name',(e->>'amount')::numeric,(e->>'date')::date,coalesce(nullif(e->>'category',''),'Uncategorized'),false,true,'operating',e->>'key') ON CONFLICT(user_id,import_key) WHERE import_key IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS c=ROW_COUNT;n:=n+c;
 END LOOP;RETURN n;
END $$;
REVOKE ALL ON FUNCTION finance_import_statement(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION finance_import_statement(uuid,jsonb) TO authenticated;
COMMIT;
