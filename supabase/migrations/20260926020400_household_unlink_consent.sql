BEGIN;
CREATE OR REPLACE FUNCTION public.finance_unlink() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); p uuid:=public.get_partner_user_id(auth.uid()); BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 PERFORM pg_advisory_xact_lock(621409126);
 UPDATE finance_account_sharing SET enabled=false,updated_at=now() WHERE (owner_id=u AND recipient_id=p) OR (owner_id=p AND recipient_id=u);
 UPDATE partner_links SET status='ended',updated_at=now() WHERE status='active' AND u IN(user_id,partner_user_id);
END $$;
COMMIT;
