BEGIN;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS provider_institution_id text;
CREATE TABLE finance_transaction_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL,transaction_id uuid NOT NULL,operation text NOT NULL,record jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE finance_transaction_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON finance_transaction_versions FROM anon,authenticated;
GRANT SELECT ON finance_transaction_versions TO authenticated; GRANT ALL ON finance_transaction_versions TO service_role;
CREATE POLICY "Private transaction versions" ON finance_transaction_versions FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE FUNCTION finance_keep_transaction_version() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF TG_OP='DELETE' OR to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN INSERT INTO finance_transaction_versions(owner_id,transaction_id,operation,record) VALUES(OLD.user_id,OLD.id,TG_OP,to_jsonb(OLD)); END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$;
CREATE TRIGGER finance_keep_transaction_version BEFORE UPDATE OR DELETE ON transactions FOR EACH ROW EXECUTE FUNCTION finance_keep_transaction_version();
CREATE FUNCTION finance_protect_account_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Archive the financial account to retain its history'; END IF;
 IF NEW.is_deleted AND NOT coalesce(OLD.is_deleted,false) THEN
 INSERT INTO finance_balance_observations(account_id,owner_id,observed_on,balance,currency,source) VALUES(OLD.id,OLD.user_id,current_date,coalesce(OLD.current_balance,0),coalesce(OLD.currency,'USD'),'Last balance before archival') ON CONFLICT DO NOTHING;
 NEW.current_balance:=OLD.current_balance; NEW.available_balance:=OLD.available_balance;
 END IF; RETURN NEW; END $$;
CREATE TRIGGER finance_protect_account_history BEFORE DELETE OR UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION finance_protect_account_history();
DROP POLICY "Delete private finance documents" ON finance_documents;
CREATE POLICY "Delete private plans only" ON finance_documents FOR DELETE TO authenticated USING(owner_id=auth.uid() AND kind<>'close');
-- Authorized shared copies survive revocation, without granting continued access to the source.
CREATE TABLE finance_retained_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL,account_id uuid NOT NULL,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE finance_retained_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON finance_retained_history FROM anon,authenticated;
GRANT SELECT ON finance_retained_history TO authenticated; GRANT ALL ON finance_retained_history TO service_role;
CREATE POLICY "Private retained history" ON finance_retained_history FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE TABLE finance_account_continuity(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL,original_id uuid NOT NULL REFERENCES accounts(id),source_id uuid NOT NULL UNIQUE REFERENCES accounts(id),starts_on date NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),CHECK(original_id<>source_id),UNIQUE(original_id,starts_on));
ALTER TABLE finance_account_continuity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON finance_account_continuity FROM anon,authenticated;
GRANT SELECT ON finance_account_continuity TO authenticated;GRANT ALL ON finance_account_continuity TO service_role;
CREATE POLICY "Authorized continuity" ON finance_account_continuity FOR SELECT TO authenticated USING(owner_id=auth.uid() OR (finance_can_read_account(original_id) AND finance_can_read_account(source_id)));
CREATE FUNCTION finance_retain_shared(_account uuid,_recipient uuid,_from date) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE p jsonb; BEGIN
 IF _recipient IS NULL OR _from IS NULL THEN RETURN; END IF;
 SELECT jsonb_build_object('accounts',jsonb_build_array(to_jsonb(a)-'plaid_account_id'),'transactions',coalesce((SELECT jsonb_agg(to_jsonb(t)-'plaid_transaction_id') FROM transactions t WHERE account_id=a.id AND date>=_from),'[]'::jsonb),'allocations',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM finance_allocations r WHERE account_id=a.id),'[]'::jsonb),'categorySplits',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM finance_category_splits r WHERE account_id=a.id),'[]'::jsonb),'observations',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM finance_balance_observations r WHERE account_id=a.id AND observed_on>=_from),'[]'::jsonb),'sharing',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM finance_account_sharing r WHERE account_id=a.id),'[]'::jsonb),'continuity',coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM finance_account_continuity c WHERE (original_id=a.id OR source_id=a.id) AND EXISTS(SELECT 1 FROM finance_account_sharing s WHERE s.account_id=c.original_id AND s.enabled AND s.recipient_id=_recipient) AND EXISTS(SELECT 1 FROM finance_account_sharing s WHERE s.account_id=c.source_id AND s.enabled AND s.recipient_id=_recipient)),'[]'::jsonb),'budgets','[]'::jsonb,'historyFrom',_from,'retainedThrough',now()) INTO p FROM accounts a WHERE id=_account;
 IF p IS NOT NULL THEN INSERT INTO finance_retained_history(owner_id,account_id,payload) VALUES(_recipient,_account,p); END IF; END $$;
REVOKE ALL ON FUNCTION finance_retain_shared(uuid,uuid,date) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION finance_retain_on_visibility_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF OLD.enabled AND EXISTS(SELECT 1 FROM partner_links WHERE status='active' AND ((user_id=OLD.owner_id AND partner_user_id=OLD.recipient_id) OR (user_id=OLD.recipient_id AND partner_user_id=OLD.owner_id))) THEN
 IF TG_OP='DELETE' OR NOT NEW.enabled OR NEW.recipient_id IS DISTINCT FROM OLD.recipient_id OR NEW.history_from>OLD.history_from THEN PERFORM finance_retain_shared(OLD.account_id,OLD.recipient_id,OLD.history_from); END IF; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$;
CREATE TRIGGER finance_retain_on_visibility_change BEFORE UPDATE OR DELETE ON finance_account_sharing FOR EACH ROW EXECUTE FUNCTION finance_retain_on_visibility_change();
CREATE FUNCTION finance_retain_on_unlink() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE s record; BEGIN
 IF OLD.status='active' THEN IF TG_OP='DELETE' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.partner_user_id IS DISTINCT FROM OLD.partner_user_id THEN
 FOR s IN SELECT * FROM finance_account_sharing WHERE enabled AND ((owner_id=OLD.user_id AND recipient_id=OLD.partner_user_id) OR (owner_id=OLD.partner_user_id AND recipient_id=OLD.user_id)) LOOP PERFORM finance_retain_shared(s.account_id,s.recipient_id,s.history_from); END LOOP;
 END IF; END IF; IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$;
CREATE TRIGGER finance_retain_on_unlink BEFORE UPDATE OR DELETE ON partner_links FOR EACH ROW EXECUTE FUNCTION finance_retain_on_unlink();
CREATE FUNCTION finance_link_account_history(_original uuid,_source uuid,_start date) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE a accounts;b accounts; BEGIN
 IF auth.uid() IS NULL OR _original=_source OR _start IS NULL OR NOT isfinite(_start) THEN RAISE EXCEPTION 'Choose two accounts and a handoff date'; END IF;
 PERFORM 1 FROM accounts WHERE id IN (_original,_source) ORDER BY id FOR UPDATE;
 SELECT * INTO a FROM accounts WHERE id=_original AND user_id=auth.uid(); SELECT * INTO b FROM accounts WHERE id=_source AND user_id=auth.uid();
 IF a.id IS NULL OR b.id IS NULL OR coalesce(a.currency,'USD')<>coalesce(b.currency,'USD') OR a.type<>b.type THEN RAISE EXCEPTION 'Choose your own accounts of the same type and currency'; END IF;
 IF EXISTS(SELECT 1 FROM finance_account_continuity WHERE source_id IN (_original,_source) OR original_id=_source OR (original_id=_original AND starts_on>=_start)) THEN RAISE EXCEPTION 'Use the original history account and a later handoff date'; END IF;
 INSERT INTO finance_account_continuity(owner_id,original_id,source_id,starts_on) VALUES(auth.uid(),_original,_source,_start);
 END $$;
REVOKE ALL ON FUNCTION finance_link_account_history(uuid,uuid,date) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION finance_link_account_history(uuid,uuid,date) TO authenticated;
CREATE INDEX finance_transaction_versions_owner ON finance_transaction_versions(owner_id,recorded_at);
CREATE INDEX finance_retained_history_owner ON finance_retained_history(owner_id,created_at);
COMMIT;
