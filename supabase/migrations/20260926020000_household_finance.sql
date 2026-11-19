BEGIN;
CREATE TABLE IF NOT EXISTS public.finance_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
 owner_id uuid NOT NULL, partner_id uuid, effective_from date NOT NULL,
 owner_pct numeric NOT NULL CHECK(owner_pct BETWEEN 0 AND 100), included boolean NOT NULL DEFAULT false,
 note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(account_id,effective_from)
);
CREATE TABLE IF NOT EXISTS public.finance_account_sharing (
 account_id uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE, owner_id uuid NOT NULL,
 recipient_id uuid, history_from date, enabled boolean NOT NULL DEFAULT false,
 duplicate_of uuid REFERENCES public.accounts(id), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (NOT enabled OR (recipient_id IS NOT NULL AND history_from IS NOT NULL)), CHECK(account_id IS DISTINCT FROM duplicate_of)
);
CREATE TABLE IF NOT EXISTS public.finance_budget_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL DEFAULT auth.uid(),
 partner_link_id uuid REFERENCES public.partner_links(id) ON DELETE CASCADE,
 category text NOT NULL CHECK(length(trim(category)) BETWEEN 1 AND 100),
 view text NOT NULL CHECK(view IN ('mine','household')), currency text NOT NULL DEFAULT 'USD' CHECK(currency ~ '^[A-Z]{3}$'),
 effective_month date NOT NULL CHECK(extract(day from effective_month)=1), amount numeric NOT NULL CHECK(amount>=0),
 created_at timestamptz NOT NULL DEFAULT now(), CHECK ((view='mine' AND partner_link_id IS NULL) OR (view='household' AND partner_link_id IS NOT NULL))
);
ALTER TABLE public.finance_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_account_sharing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_budget_versions ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.finance_can_read_account(_id uuid, _date date DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM finance_account_sharing s WHERE s.account_id=_id AND s.enabled AND s.recipient_id=auth.uid()
 AND s.owner_id=public.get_partner_user_id(auth.uid()) AND (_date IS NULL OR _date>=s.history_from))
$$;
REVOKE ALL ON FUNCTION public.finance_can_read_account(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_can_read_account(uuid,date) TO authenticated;
CREATE POLICY "Finance owner or approved partner reads allocations" ON public.finance_allocations FOR SELECT TO authenticated USING(owner_id=auth.uid() OR public.finance_can_read_account(account_id));
CREATE POLICY "Finance owner or recipient reads sharing" ON public.finance_account_sharing FOR SELECT TO authenticated USING(owner_id=auth.uid() OR (recipient_id=auth.uid() AND owner_id=public.get_partner_user_id(auth.uid())));
CREATE POLICY "Finance approved account read" ON public.accounts FOR SELECT TO authenticated USING(public.finance_can_read_account(id));
CREATE POLICY "Finance approved transaction read" ON public.transactions FOR SELECT TO authenticated USING(public.finance_can_read_account(account_id,date));
CREATE POLICY "Finance budget read" ON public.finance_budget_versions FOR SELECT TO authenticated USING(
 owner_id=auth.uid() OR (view='household' AND EXISTS(SELECT 1 FROM partner_links p WHERE p.id=partner_link_id AND p.status='active' AND auth.uid() IN (p.user_id,p.partner_user_id))));
REVOKE ALL ON public.finance_allocations,public.finance_account_sharing,public.finance_budget_versions FROM anon,authenticated;
GRANT SELECT ON public.finance_allocations,public.finance_account_sharing,public.finance_budget_versions TO authenticated;
GRANT ALL ON public.finance_allocations,public.finance_account_sharing,public.finance_budget_versions TO service_role;
-- Freeze known legacy rules. No guessed earlier changes, and no new sharing grants.
INSERT INTO public.finance_allocations(account_id,owner_id,partner_id,effective_from,owner_pct,included,note)
SELECT a.id,a.user_id,public.get_partner_user_id(a.user_id),'0001-01-01',
 CASE WHEN a.is_joint AND a.joint_start_date IS NULL THEN coalesce(a.ownership_pct,p.default_ownership_pct,100) ELSE 100 END,
 coalesce(a.is_joint,false) AND a.joint_start_date IS NULL,'Imported existing allocation; earlier changes unknown'
FROM accounts a LEFT JOIN partner_profiles p ON p.user_id=a.user_id ON CONFLICT DO NOTHING;
INSERT INTO public.finance_allocations(account_id,owner_id,partner_id,effective_from,owner_pct,included,note)
SELECT a.id,a.user_id,public.get_partner_user_id(a.user_id),a.joint_start_date,coalesce(a.ownership_pct,p.default_ownership_pct,100),true,'Imported joint start'
FROM accounts a LEFT JOIN partner_profiles p ON p.user_id=a.user_id WHERE a.is_joint AND a.joint_start_date IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO public.finance_allocations(account_id,owner_id,partner_id,effective_from,owner_pct,included,note)
SELECT a.id,a.user_id,public.get_partner_user_id(a.user_id),a.joint_end_date+1,100,false,'Imported joint end'
FROM accounts a WHERE a.is_joint AND a.joint_end_date IS NOT NULL ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.finance_seed_account() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN INSERT INTO finance_allocations(account_id,owner_id,effective_from,owner_pct,included,note) VALUES(NEW.id,NEW.user_id,'0001-01-01',100,false,'Account created'); RETURN NEW; END $$;
CREATE TRIGGER finance_seed_account AFTER INSERT ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.finance_seed_account();
CREATE OR REPLACE FUNCTION public.finance_schedule(_accounts uuid[],_date date,_pct numeric,_included boolean,_note text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a uuid; u uuid:=auth.uid(); BEGIN
 IF u IS NULL OR _date IS NULL OR _date<current_date OR _pct IS NULL OR _pct<0 OR _pct>100 OR _included IS NULL OR coalesce(cardinality(_accounts),0)=0 THEN RAISE EXCEPTION 'Choose accounts, today or a future date, and a split from 0 to 100'; END IF;
 FOREACH a IN ARRAY _accounts LOOP
  IF NOT EXISTS(SELECT 1 FROM accounts WHERE id=a AND user_id=u) THEN RAISE EXCEPTION 'You can change only your own accounts'; END IF;
  INSERT INTO finance_allocations(account_id,owner_id,partner_id,effective_from,owner_pct,included,note)
  VALUES(a,u,public.get_partner_user_id(u),_date,_pct,_included,left(coalesce(_note,''),300));
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.finance_cancel_schedule(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 DELETE FROM finance_allocations WHERE id=_id AND owner_id=auth.uid() AND effective_from>current_date;
 IF NOT FOUND THEN RAISE EXCEPTION 'Only a future arrangement can be cancelled'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.finance_share_account(_account uuid,_enabled boolean,_from date,_duplicate uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); p uuid:=public.get_partner_user_id(auth.uid()); BEGIN
 IF u IS NULL OR NOT EXISTS(SELECT 1 FROM accounts WHERE id=_account AND user_id=u) THEN RAISE EXCEPTION 'Account not owned'; END IF;
 IF _enabled IS NULL OR (_enabled AND (p IS NULL OR _from IS NULL)) THEN RAISE EXCEPTION 'Link your partner and choose a history start date'; END IF;
 IF _duplicate IS NOT NULL THEN
  IF _duplicate=_account OR NOT EXISTS(SELECT 1 FROM accounts a WHERE a.id=_duplicate AND (a.user_id=u OR public.finance_can_read_account(a.id)))
   OR EXISTS(SELECT 1 FROM finance_account_sharing WHERE account_id=_duplicate AND duplicate_of IS NOT NULL)
   OR EXISTS(SELECT 1 FROM finance_account_sharing WHERE duplicate_of=_account) THEN RAISE EXCEPTION 'Choose a visible primary account that is not another duplicate'; END IF;
 END IF;
 INSERT INTO finance_account_sharing(account_id,owner_id,recipient_id,history_from,enabled,duplicate_of)
 VALUES(_account,u,p,_from,_enabled,_duplicate)
 ON CONFLICT(account_id) DO UPDATE SET recipient_id=p,history_from=_from,enabled=_enabled,duplicate_of=_duplicate,updated_at=now();
END $$;
CREATE OR REPLACE FUNCTION public.finance_save_budget(_category text,_view text,_currency text,_month date,_amount numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); l uuid; BEGIN
 IF u IS NULL OR _month<date_trunc('month',current_date)::date OR _month IS NULL OR _amount IS NULL OR _amount<0 OR _view NOT IN ('mine','household') THEN RAISE EXCEPTION 'Choose this month or a future month and a nonnegative budget'; END IF;
 IF _view='household' THEN SELECT id INTO l FROM partner_links WHERE status='active' AND u IN(user_id,partner_user_id) ORDER BY linked_at DESC LIMIT 1;
 IF l IS NULL THEN RAISE EXCEPTION 'Link a partner before creating a household budget'; END IF; END IF;
 INSERT INTO finance_budget_versions(owner_id,partner_link_id,category,view,currency,effective_month,amount)
 VALUES(u,l,trim(_category),_view,upper(_currency),_month,_amount);
END $$;
-- Ensure legacy sharing is explicitly represented, then decouple access from the joint flag.
INSERT INTO finance_account_sharing(account_id,owner_id,recipient_id,history_from,enabled)
 SELECT id,user_id,public.get_partner_user_id(user_id),'0001-01-01',true FROM accounts WHERE is_joint AND public.get_partner_user_id(user_id) IS NOT NULL ON CONFLICT DO NOTHING;
DROP POLICY IF EXISTS "Partners can view joint accounts" ON public.accounts;
DROP POLICY IF EXISTS "Partners can view joint transactions" ON public.transactions;
-- Owner overrides are immutable snapshots of the known percentages after this migration.
UPDATE accounts a SET ownership_pct=coalesce(a.ownership_pct,p.default_ownership_pct,100) FROM partner_profiles p WHERE a.user_id=p.user_id AND a.is_joint AND a.ownership_pct IS NULL;
REVOKE ALL ON FUNCTION public.finance_schedule(uuid[],date,numeric,boolean,text),public.finance_cancel_schedule(uuid),public.finance_share_account(uuid,boolean,date,uuid),public.finance_save_budget(text,text,text,date,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_schedule(uuid[],date,numeric,boolean,text),public.finance_cancel_schedule(uuid),public.finance_share_account(uuid,boolean,date,uuid),public.finance_save_budget(text,text,text,date,numeric) TO authenticated;
COMMIT;
