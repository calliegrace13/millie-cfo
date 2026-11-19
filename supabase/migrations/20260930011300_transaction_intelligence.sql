BEGIN;
ALTER TABLE transactions ADD COLUMN provider_metadata jsonb NOT NULL DEFAULT '{}',ADD COLUMN classification_source text NOT NULL DEFAULT 'legacy',ADD COLUMN classification_locked boolean NOT NULL DEFAULT false,ADD COLUMN classification_kind text,ADD COLUMN classification_confidence numeric,ADD COLUMN classification_reason text,ADD COLUMN classification_version text,ADD COLUMN merchant_key text;
UPDATE transactions SET classification_locked=true,classification_source='user',classification_reason='Previously reviewed; preserved during the categorization upgrade.' WHERE needs_review=false OR is_transfer_exception OR linked_transfer_id IS NOT NULL;
CREATE TABLE finance_merchant_preferences(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL DEFAULT auth.uid(),merchant_key text NOT NULL,category text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(owner_id,merchant_key));
ALTER TABLE finance_merchant_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON finance_merchant_preferences FROM anon,authenticated;GRANT SELECT ON finance_merchant_preferences TO authenticated;GRANT ALL ON finance_merchant_preferences TO service_role;
CREATE POLICY "Private merchant preferences" ON finance_merchant_preferences FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE FUNCTION finance_protect_classification() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF auth.role()='authenticated' THEN
  IF TG_OP='INSERT' THEN IF NEW.category IS NOT NULL THEN NEW.classification_locked:=true;NEW.classification_source:='user';END IF;
  ELSIF NEW.category IS DISTINCT FROM OLD.category OR NEW.cash_flow_type IS DISTINCT FROM OLD.cash_flow_type OR NEW.linked_transfer_id IS DISTINCT FROM OLD.linked_transfer_id OR (OLD.needs_review AND NOT NEW.needs_review) THEN NEW.classification_locked:=true;NEW.classification_source:='user';NEW.classification_reason:='Your correction or review is protected from automatic categorization.';END IF;
 END IF;RETURN NEW;END $$;
CREATE TRIGGER finance_protect_classification BEFORE INSERT OR UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION finance_protect_classification();
-- Retain the existing sync commit, lease, pending-to-posted identity and cursor semantics.
ALTER FUNCTION finance_apply_sync_page(uuid,uuid,jsonb,jsonb,jsonb,text) RENAME TO finance_apply_sync_page_before_classification;
REVOKE ALL ON FUNCTION finance_apply_sync_page_before_classification(uuid,uuid,jsonb,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION finance_apply_sync_page(_item uuid,_lease uuid,_added jsonb,_modified jsonb,_removed jsonb,_cursor text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid;existing uuid[];n integer;t jsonb;BEGIN
 SELECT user_id INTO STRICT owner FROM plaid_items WHERE id=_item;
 SELECT array_agg(id) INTO existing FROM transactions WHERE user_id=owner;
 n:=finance_apply_sync_page_before_classification(_item,_lease,_added,_modified,_removed,_cursor);
 FOR t IN SELECT value FROM jsonb_array_elements(coalesce(_added,'[]')||coalesce(_modified,'[]')) LOOP
  UPDATE transactions SET provider_metadata=coalesce(t->'provider_metadata','{}'),
   classification_source=CASE WHEN NOT(id=ANY(coalesce(existing,'{}'))) THEN CASE WHEN t->>'classification_source'='rule' THEN 'rule' ELSE 'auto' END ELSE classification_source END,
   classification_locked=classification_locked OR (NOT(id=ANY(coalesce(existing,'{}'))) AND coalesce(t->>'classification_source'='rule',false))
  WHERE user_id=owner AND plaid_transaction_id=t->>'transaction_id';
 END LOOP;RETURN n;END $$;
REVOKE ALL ON FUNCTION finance_apply_sync_page(uuid,uuid,jsonb,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION finance_apply_sync_page(uuid,uuid,jsonb,jsonb,jsonb,text) TO service_role;
CREATE FUNCTION finance_apply_classifications(_owner uuid,_changes jsonb,_automatic boolean DEFAULT true) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c jsonb;t transactions;other transactions;n integer:=0;BEGIN
 IF _owner IS NULL OR _changes IS NULL OR jsonb_typeof(_changes)<>'array' OR jsonb_array_length(_changes)>100 OR _automatic IS NULL THEN RAISE EXCEPTION 'Invalid classification batch';END IF;
 FOR t IN SELECT * FROM transactions WHERE user_id=_owner AND id IN(SELECT (value->>'id')::uuid FROM jsonb_array_elements(_changes)) ORDER BY id FOR UPDATE LOOP NULL;END LOOP;
 FOR c IN SELECT value FROM jsonb_array_elements(_changes) LOOP
  SELECT * INTO t FROM transactions WHERE id=(c->>'id')::uuid AND user_id=_owner;
  IF NOT FOUND OR t.classification_locked OR t.pending OR (_automatic AND t.classification_source<>'auto') THEN RAISE EXCEPTION 'Transaction is not eligible for automatic edits';END IF;
  IF c->'expected' IS DISTINCT FROM jsonb_build_object('amount',t.amount,'date',t.date,'account_id',t.account_id,'category',t.category,'updated_at',t.updated_at,'linked_transfer_id',t.linked_transfer_id) THEN RAISE EXCEPTION 'Transaction changed after analysis';END IF;
  IF c->>'category' IS NULL OR length(c->>'category') NOT BETWEEN 1 AND 100 OR c->>'kind' NOT IN('expense','income','refund','transfer','card_payment','debt_payment','unknown') OR (c->>'confidence')::numeric NOT BETWEEN 0 AND 1 THEN RAISE EXCEPTION 'Invalid classification';END IF;
  IF c->>'match_id' IS NOT NULL AND c->>'match_id'<>c->>'id' THEN
   SELECT * INTO other FROM transactions WHERE id=(c->>'match_id')::uuid AND user_id=_owner;
   IF NOT FOUND OR other.pending OR other.classification_locked OR other.account_id=t.account_id OR other.amount<>-t.amount OR t.amount=0 OR abs(other.date-t.date)>5 OR (SELECT currency FROM accounts WHERE id=other.account_id) IS DISTINCT FROM (SELECT currency FROM accounts WHERE id=t.account_id) OR (other.linked_transfer_id IS NOT NULL AND other.linked_transfer_id<>t.id) OR (t.linked_transfer_id IS NOT NULL AND t.linked_transfer_id<>other.id) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(_changes) x WHERE x->>'id'=other.id::text AND x->>'match_id'=t.id::text AND x->>'kind' IN('transfer','card_payment')) OR c->>'kind' NOT IN('transfer','card_payment') THEN RAISE EXCEPTION 'Invalid or incomplete transfer pair';END IF;
  ELSIF c->>'match_id'=c->>'id' THEN RAISE EXCEPTION 'Cannot link a transaction to itself';END IF;
 END LOOP;
 FOR c IN SELECT value FROM jsonb_array_elements(_changes) LOOP
  UPDATE transactions SET category=c->>'category',classification_kind=c->>'kind',classification_confidence=(c->>'confidence')::numeric,classification_reason=left(c->>'reason',1000),classification_version=c->>'version',classification_source=CASE WHEN _automatic THEN 'auto' ELSE 'user' END,classification_locked=NOT _automatic,merchant_key=c->>'merchant_key',needs_review=CASE WHEN _automatic THEN coalesce((c->>'review')::boolean,true) ELSE false END,income_type=CASE WHEN c->>'income_type'='salary' THEN 'salary' WHEN c->>'category'='Income' THEN 'other' ELSE null END,linked_transfer_id=coalesce((c->>'match_id')::uuid,linked_transfer_id) WHERE id=(c->>'id')::uuid AND user_id=_owner;n:=n+1;
 END LOOP;RETURN n;END $$;
REVOKE ALL ON FUNCTION finance_apply_classifications(uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION finance_apply_classifications(uuid,jsonb,boolean) TO service_role;
CREATE FUNCTION finance_correct_category(_id uuid,_category text,_remember boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t transactions;k text;BEGIN
 IF auth.uid() IS NULL OR _category IS NULL OR length(trim(_category)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Choose a category';END IF;
 SELECT * INTO t FROM transactions WHERE id=_id AND user_id=auth.uid() FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Only the owner can correct this transaction';END IF;
 IF t.linked_transfer_id IS NOT NULL AND _category NOT IN('Transfer','Credit Card Payment') THEN
  UPDATE transactions SET linked_transfer_id=null,classification_locked=true,classification_source='user',needs_review=true WHERE id=t.linked_transfer_id AND user_id=auth.uid() AND linked_transfer_id=t.id;
 END IF;
 k:=coalesce(t.merchant_key,CASE WHEN nullif(t.provider_metadata->>'merchant_entity_id','') IS NOT NULL THEN 'entity:'||(t.provider_metadata->>'merchant_entity_id') WHEN nullif(trim(t.merchant_name),'') IS NOT NULL THEN 'merchant:'||trim(regexp_replace(lower(t.merchant_name),'[^a-z0-9]+',' ','g')) END);
 IF _remember AND (k IS NULL OR k IN('merchant:venmo','merchant:paypal','merchant:zelle','merchant:cash app','merchant:square','merchant:stripe') OR _category IN('Income','Transfer','Credit Card Payment','Debt Payment','Reimbursement','Settlement')) THEN RAISE EXCEPTION 'Use a transaction-only correction for financial movements or unidentified merchants';END IF;
 UPDATE transactions SET category=trim(_category),classification_locked=true,classification_source='user',classification_confidence=1,classification_kind=CASE WHEN _category='Income' THEN 'income' WHEN _category='Transfer' THEN 'transfer' WHEN _category='Credit Card Payment' THEN 'card_payment' WHEN amount<0 THEN 'refund' ELSE 'expense' END,classification_reason='Your category correction is protected from future imports.',merchant_key=k,needs_review=false,income_type=CASE WHEN _category='Income' THEN coalesce(income_type,'other') ELSE null END,linked_transfer_id=CASE WHEN _category IN('Transfer','Credit Card Payment') THEN linked_transfer_id ELSE null END WHERE id=_id;
 IF _remember THEN INSERT INTO finance_merchant_preferences(owner_id,merchant_key,category) VALUES(auth.uid(),k,trim(_category)) ON CONFLICT(owner_id,merchant_key) DO UPDATE SET category=excluded.category,updated_at=now();END IF;
END $$;
REVOKE ALL ON FUNCTION finance_correct_category(uuid,text,boolean) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION finance_correct_category(uuid,text,boolean) TO authenticated;
CREATE FUNCTION finance_link_movement(_a uuid,_b uuid,_convert boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a transactions;b transactions;BEGIN
 IF auth.uid() IS NULL OR _a=_b THEN RAISE EXCEPTION 'Choose two different entries';END IF;
 PERFORM 1 FROM transactions WHERE id IN(_a,_b) AND user_id=auth.uid() ORDER BY id FOR UPDATE;
 SELECT * INTO a FROM transactions WHERE id=_a AND user_id=auth.uid();SELECT * INTO b FROM transactions WHERE id=_b AND user_id=auth.uid();
 IF a.id IS NULL OR b.id IS NULL OR a.account_id=b.account_id OR a.account_id IS NULL OR b.account_id IS NULL OR a.amount<>-b.amount OR a.amount=0 OR a.pending OR b.pending OR a.linked_transfer_id IS NOT NULL OR b.linked_transfer_id IS NOT NULL OR (SELECT currency FROM accounts WHERE id=a.account_id) IS DISTINCT FROM (SELECT currency FROM accounts WHERE id=b.account_id) THEN RAISE EXCEPTION 'Choose unlinked, posted entries in different accounts with the same currency and exact opposite amounts';END IF;
 IF a.category NOT IN('Transfer','Credit Card Payment') OR (NOT _convert AND b.category NOT IN('Transfer','Credit Card Payment')) THEN RAISE EXCEPTION 'Confirm these are account movements first';END IF;
 UPDATE transactions SET linked_transfer_id=CASE WHEN id=_a THEN _b ELSE _a END,category=CASE WHEN category='Credit Card Payment' THEN category ELSE 'Transfer' END,classification_source='user',classification_locked=true,classification_reason='You confirmed both sides of this account movement.',needs_review=false WHERE id IN(_a,_b);
END $$;
REVOKE ALL ON FUNCTION finance_link_movement(uuid,uuid,boolean) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION finance_link_movement(uuid,uuid,boolean) TO authenticated;
COMMIT;
