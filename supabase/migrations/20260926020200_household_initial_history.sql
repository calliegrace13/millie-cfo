BEGIN;
CREATE OR REPLACE FUNCTION public.finance_initialize(_accounts uuid[],_date date,_pct numeric,_included boolean,_note text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a uuid; u uuid:=auth.uid(); p uuid:=public.get_partner_user_id(auth.uid()); BEGIN
 IF u IS NULL OR _date IS NULL OR _date>current_date OR _date<='0001-01-01' OR _pct IS NULL OR _pct<0 OR _pct>100 OR _included IS NULL OR coalesce(cardinality(_accounts),0)=0 THEN RAISE EXCEPTION 'Choose accounts, a historical start date, and a valid split'; END IF;
 IF _pct<100 AND p IS NULL THEN RAISE EXCEPTION 'Link your partner before allocating a share to them'; END IF;
 FOREACH a IN ARRAY _accounts LOOP
  PERFORM 1 FROM accounts WHERE id=a AND user_id=u FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'You can initialize only your own accounts'; END IF;
  IF (SELECT count(*) FROM finance_allocations WHERE account_id=a)<>1 OR NOT EXISTS(SELECT 1 FROM finance_allocations WHERE account_id=a AND note='Account created' AND effective_from='0001-01-01') THEN RAISE EXCEPTION 'This account already has historical rules. Use a future arrangement instead'; END IF;
  INSERT INTO finance_allocations(account_id,owner_id,partner_id,effective_from,owner_pct,included,note) VALUES(a,u,p,_date,_pct,_included,'Initial history: '||left(coalesce(_note,''),250));
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.finance_initialize(uuid[],date,numeric,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_initialize(uuid[],date,numeric,boolean,text) TO authenticated;
-- Preserve source rule changes as audit events, including cancellation of a future arrangement.
CREATE TABLE public.finance_allocation_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL, account_id uuid NOT NULL, operation text NOT NULL, rule jsonb NOT NULL, changed_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.finance_allocation_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_allocation_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.finance_allocation_audit TO authenticated;
GRANT ALL ON public.finance_allocation_audit TO service_role;
CREATE POLICY "Finance owner reads rule audit" ON public.finance_allocation_audit FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE OR REPLACE FUNCTION public.finance_audit_rule() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF TG_OP='DELETE' THEN INSERT INTO finance_allocation_audit(owner_id,account_id,operation,rule) VALUES(OLD.owner_id,OLD.account_id,TG_OP,to_jsonb(OLD));RETURN OLD;
 ELSE INSERT INTO finance_allocation_audit(owner_id,account_id,operation,rule) VALUES(NEW.owner_id,NEW.account_id,TG_OP,to_jsonb(NEW));RETURN NEW;END IF;
END $$;
CREATE TRIGGER finance_audit_rule AFTER INSERT OR UPDATE OR DELETE ON public.finance_allocations FOR EACH ROW EXECUTE FUNCTION public.finance_audit_rule();
COMMIT;
