BEGIN;
ALTER TABLE recurring_transactions ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE finance_allocations ADD COLUMN IF NOT EXISTS balance_pct numeric CHECK(balance_pct BETWEEN 0 AND 100);
CREATE TABLE public.finance_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL DEFAULT auth.uid(),
 kind text NOT NULL CHECK(kind IN ('scope','scenario','project','goal','close')), name text NOT NULL CHECK(length(name) BETWEEN 1 AND 150),
 payload jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE finance_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON finance_documents FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON finance_documents TO authenticated;
GRANT ALL ON finance_documents TO service_role;
CREATE POLICY "Private finance documents" ON finance_documents TO authenticated USING(owner_id=auth.uid()) WITH CHECK(owner_id=auth.uid());
CREATE TABLE public.finance_balance_observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,owner_id uuid NOT NULL,
 observed_on date NOT NULL,balance numeric NOT NULL,currency text NOT NULL,source text NOT NULL DEFAULT 'Latest imported balance', recorded_at timestamptz NOT NULL DEFAULT now(),UNIQUE(account_id,observed_on)
);
ALTER TABLE finance_balance_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON finance_balance_observations FROM anon,authenticated;
GRANT SELECT ON finance_balance_observations TO authenticated;
GRANT ALL ON finance_balance_observations TO service_role;
CREATE POLICY "Authorized balance history" ON finance_balance_observations FOR SELECT TO authenticated USING(owner_id=auth.uid() OR finance_can_read_account(account_id,observed_on));
CREATE TABLE public.finance_category_splits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,owner_id uuid NOT NULL,partner_id uuid,
 category text NOT NULL CHECK(length(category) BETWEEN 1 AND 100),effective_from date NOT NULL,owner_pct numeric NOT NULL CHECK(owner_pct BETWEEN 0 AND 100),UNIQUE(account_id,category,effective_from)
);
ALTER TABLE finance_category_splits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON finance_category_splits FROM anon,authenticated;
GRANT SELECT ON finance_category_splits TO authenticated;
GRANT ALL ON finance_category_splits TO service_role;
CREATE POLICY "Authorized category rules" ON finance_category_splits FOR SELECT TO authenticated USING(owner_id=auth.uid() OR finance_can_read_account(account_id));
CREATE FUNCTION public.finance_account_transition(_account uuid,_history date,_date date,_before numeric,_after numeric,_balance_before numeric,_balance_after numeric,_included boolean,_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); p uuid:=get_partner_user_id(auth.uid()); BEGIN
 IF u IS NULL OR _history IS NULL OR _date IS NULL OR NOT isfinite(_history) OR NOT isfinite(_date) OR _history>=_date OR _history<'0001-01-01' OR _included IS NULL OR _before IS NULL OR _after IS NULL OR _balance_before IS NULL OR _balance_after IS NULL OR least(_before,_after,_balance_before,_balance_after)<0 OR greatest(_before,_after,_balance_before,_balance_after)>100 THEN RAISE EXCEPTION 'Choose valid dates and percentages'; END IF;
 IF least(_before,_after,_balance_before,_balance_after)<100 AND p IS NULL THEN RAISE EXCEPTION 'Link your partner before assigning their share'; END IF;
 PERFORM 1 FROM accounts WHERE id=_account AND user_id=u AND NOT coalesce(is_deleted,false) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Only the account connector can set its history'; END IF;
 -- Deletes are audited by the existing allocation trigger. Later arrangements survive.
 DELETE FROM finance_allocations WHERE account_id=_account AND effective_from>=_history AND effective_from<=_date;
 INSERT INTO finance_allocations(account_id,owner_id,partner_id,effective_from,owner_pct,balance_pct,included,note)
 VALUES(_account,u,p,_history,_before,_balance_before,false,'Before sharing: '||left(coalesce(_note,''),250)),
       (_account,u,p,_date,_after,_balance_after,_included,'Life change: '||left(coalesce(_note,''),250));
END $$;
CREATE FUNCTION public.finance_category_split(_account uuid,_category text,_date date,_pct numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();p uuid:=get_partner_user_id(auth.uid()); BEGIN
 IF u IS NULL OR _date IS NULL OR NOT isfinite(_date) OR _pct IS NULL OR _pct<0 OR _pct>100 OR length(trim(_category)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid rule'; END IF;
 PERFORM 1 FROM accounts WHERE id=_account AND user_id=u FOR UPDATE;
 IF NOT FOUND OR (_pct<100 AND p IS NULL) THEN RAISE EXCEPTION 'Own the account and link your partner first'; END IF;
 INSERT INTO finance_category_splits(account_id,owner_id,partner_id,category,effective_from,owner_pct) VALUES(_account,u,p,trim(_category),_date,_pct)
 ON CONFLICT(account_id,category,effective_from) DO UPDATE SET owner_pct=excluded.owner_pct,partner_id=excluded.partner_id;
END $$;
CREATE FUNCTION public.finance_capture_balances() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 INSERT INTO finance_balance_observations(account_id,owner_id,observed_on,balance,currency,source)
 SELECT id,user_id,current_date,CASE WHEN is_zero_balance THEN 0 ELSE current_balance END,coalesce(currency,'USD'),CASE WHEN is_manual THEN 'Manual account balance' ELSE 'Latest bank-imported balance; not a bank statement' END FROM accounts WHERE user_id=auth.uid() AND NOT coalesce(is_deleted,false) AND current_balance IS NOT NULL
 ON CONFLICT(account_id,observed_on) DO UPDATE SET balance=excluded.balance,recorded_at=now(),source=excluded.source;
 GET DIAGNOSTICS n=ROW_COUNT;RETURN n;
END $$;
CREATE FUNCTION public.finance_end_arrangements(_date date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();p uuid:=get_partner_user_id(auth.uid()); a record; BEGIN
 IF u IS NULL OR _date IS NULL OR NOT isfinite(_date) OR _date<current_date THEN RAISE EXCEPTION 'Choose today or a future date'; END IF;
 FOR a IN SELECT id FROM accounts WHERE user_id=u AND NOT coalesce(is_deleted,false) ORDER BY id FOR UPDATE LOOP
  -- End only expense responsibility. Preserve existing recorded balance ownership.
  INSERT INTO finance_allocations(account_id,owner_id,partner_id,effective_from,owner_pct,balance_pct,included,note)
  SELECT a.id,u,r.partner_id,_date,100,coalesce(r.balance_pct,r.owner_pct),false,'Separate expenses; review balance ownership separately' FROM (SELECT * FROM finance_allocations WHERE account_id=a.id AND effective_from<=_date ORDER BY effective_from DESC LIMIT 1) r
  ON CONFLICT(account_id,effective_from) DO UPDATE SET owner_pct=100,included=false,note=excluded.note;
  UPDATE finance_allocations SET balance_pct=coalesce(balance_pct,owner_pct),owner_pct=100,included=false,note='Separate expenses; balance ownership retained' WHERE account_id=a.id AND effective_from>_date;
  DELETE FROM finance_category_splits WHERE account_id=a.id AND effective_from>=_date;
  INSERT INTO finance_category_splits(account_id,owner_id,partner_id,category,effective_from,owner_pct) SELECT a.id,u,p,category,_date,100 FROM finance_category_splits WHERE account_id=a.id GROUP BY category;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION finance_account_transition(uuid,date,date,numeric,numeric,numeric,numeric,boolean,text),finance_category_split(uuid,text,date,numeric),finance_capture_balances(),finance_end_arrangements(date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION finance_account_transition(uuid,date,date,numeric,numeric,numeric,numeric,boolean,text),finance_category_split(uuid,text,date,numeric),finance_capture_balances(),finance_end_arrangements(date) TO authenticated;
CREATE FUNCTION public.finance_reserve_goal(_account uuid,_name text,_reserved numeric,_target numeric,_deadline date DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a accounts; pct numeric; used numeric; result uuid; BEGIN
 SELECT * INTO a FROM accounts WHERE id=_account AND user_id=auth.uid() AND NOT coalesce(is_deleted,false) FOR UPDATE;
 IF NOT FOUND OR a.type NOT IN ('checking','savings','depository') OR _reserved IS NULL OR _target IS NULL OR _reserved<0 OR _reserved::text IN ('NaN','Infinity','-Infinity') OR _target::text IN ('NaN','Infinity','-Infinity') OR _target<=0 OR _reserved>_target OR length(trim(_name)) NOT BETWEEN 1 AND 150 THEN RAISE EXCEPTION 'Choose your cash account, a name, and valid funding amounts'; END IF;
 SELECT coalesce(balance_pct,owner_pct) INTO pct FROM finance_allocations WHERE account_id=a.id AND effective_from<=current_date ORDER BY effective_from DESC LIMIT 1;
 SELECT coalesce(sum((payload->>'reserved')::numeric),0) INTO used FROM finance_documents WHERE owner_id=auth.uid() AND kind='goal' AND payload->>'accountId'=_account::text;
 IF used+_reserved>greatest(0,CASE WHEN a.is_zero_balance THEN 0 ELSE coalesce(a.current_balance,0) END)*coalesce(pct,100)/100 THEN RAISE EXCEPTION 'Reservations exceed your current share of this account'; END IF;
 INSERT INTO finance_documents(owner_id,kind,name,payload) VALUES(auth.uid(),'goal',trim(_name),jsonb_build_object('accountId',_account,'currency',coalesce(a.currency,'USD'),'reserved',_reserved,'target',_target,'deadline',_deadline)) RETURNING id INTO result;RETURN result;
END $$;
REVOKE ALL ON FUNCTION finance_reserve_goal(uuid,text,numeric,numeric,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION finance_reserve_goal(uuid,text,numeric,numeric,date) TO authenticated;
-- Goal reservations go through the locked RPC; private close summaries cannot be edited.
DROP POLICY "Private finance documents" ON finance_documents;
CREATE POLICY "Read private finance documents" ON finance_documents FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE POLICY "Insert private finance documents" ON finance_documents FOR INSERT TO authenticated WITH CHECK(owner_id=auth.uid() AND kind<>'goal');
CREATE POLICY "Update private plans" ON finance_documents FOR UPDATE TO authenticated USING(owner_id=auth.uid() AND kind NOT IN ('goal','close')) WITH CHECK(owner_id=auth.uid() AND kind NOT IN ('goal','close'));
CREATE POLICY "Delete private finance documents" ON finance_documents FOR DELETE TO authenticated USING(owner_id=auth.uid());
CREATE FUNCTION public.finance_observe_balance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT coalesce(NEW.is_deleted,false) AND NEW.current_balance IS NOT NULL THEN
 INSERT INTO finance_balance_observations(account_id,owner_id,observed_on,balance,currency,source) VALUES(NEW.id,NEW.user_id,current_date,CASE WHEN NEW.is_zero_balance THEN 0 ELSE NEW.current_balance END,coalesce(NEW.currency,'USD'),'Observed account update; latest value, not statement close')
 ON CONFLICT(account_id,observed_on) DO UPDATE SET balance=excluded.balance,recorded_at=now(),source=excluded.source;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER finance_observe_balance AFTER INSERT OR UPDATE OF current_balance ON accounts FOR EACH ROW EXECUTE FUNCTION finance_observe_balance();
CREATE FUNCTION finance_preserve_balance_owner() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF NEW.balance_pct IS NULL THEN
 SELECT coalesce(balance_pct,owner_pct) INTO NEW.balance_pct FROM finance_allocations WHERE account_id=NEW.account_id AND effective_from<=NEW.effective_from ORDER BY effective_from DESC LIMIT 1;
 NEW.balance_pct:=coalesce(NEW.balance_pct,100);
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER finance_preserve_balance_owner BEFORE INSERT ON finance_allocations FOR EACH ROW EXECUTE FUNCTION finance_preserve_balance_owner();
COMMIT;
