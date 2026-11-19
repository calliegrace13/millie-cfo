BEGIN;
ALTER TABLE public.partner_links ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.partner_links DROP CONSTRAINT IF EXISTS partner_links_pairing_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS finance_pending_code_unique ON public.partner_links(pairing_code) WHERE status='pending';
CREATE TABLE IF NOT EXISTS public.finance_pair_attempts(user_id uuid NOT NULL, attempted_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.finance_pair_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_pair_attempts FROM PUBLIC,anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.partner_links FROM authenticated;
CREATE OR REPLACE FUNCTION public.finance_invite() RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); result partner_links; BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 PERFORM pg_advisory_xact_lock(621409126);
 IF EXISTS(SELECT 1 FROM partner_links WHERE status='active' AND u IN(user_id,partner_user_id)) THEN RAISE EXCEPTION 'Already linked'; END IF;
 IF (SELECT count(*) FROM partner_links WHERE user_id=u AND created_at>now()-interval '1 day')>=20 THEN RAISE EXCEPTION 'Please try again tomorrow'; END IF;
 UPDATE partner_links SET status='expired' WHERE user_id=u AND status='pending';
 INSERT INTO partner_links(user_id,pairing_code,status,expires_at) VALUES(u,replace(gen_random_uuid()::text,'-',''),'pending',now()+interval '15 minutes') RETURNING * INTO result;
 RETURN row_to_json(result);
END $$;
CREATE OR REPLACE FUNCTION public.redeem_partner_code(_code text) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); link partner_links; BEGIN
 IF u IS NULL THEN RETURN json_build_object('error','Sign in first'); END IF;
 PERFORM pg_advisory_xact_lock(621409126);
 IF (SELECT count(*) FROM finance_pair_attempts WHERE user_id=u AND attempted_at>now()-interval '15 minutes')>=10 THEN RETURN json_build_object('error','Too many attempts. Try again in 15 minutes.'); END IF;
 INSERT INTO finance_pair_attempts(user_id) VALUES(u);
 SELECT * INTO link FROM partner_links WHERE lower(pairing_code)=lower(trim(_code)) AND status='pending' AND expires_at>now() FOR UPDATE;
 IF link.id IS NULL OR link.user_id=u THEN RETURN json_build_object('error','Invalid or expired invitation'); END IF;
 IF EXISTS(SELECT 1 FROM partner_links WHERE status='active' AND (u IN(user_id,partner_user_id) OR link.user_id IN(user_id,partner_user_id))) THEN RETURN json_build_object('error','One of you is already linked'); END IF;
 UPDATE partner_links SET partner_user_id=u,status='active',linked_at=now(),updated_at=now() WHERE id=link.id;
 RETURN json_build_object('success',true);
END $$;
CREATE OR REPLACE FUNCTION public.finance_unlink() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN UPDATE partner_links SET status='ended',updated_at=now() WHERE status='active' AND auth.uid() IN(user_id,partner_user_id); END $$;
REVOKE ALL ON FUNCTION public.finance_invite(),public.redeem_partner_code(text),public.finance_unlink() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_invite(),public.redeem_partner_code(text),public.finance_unlink() TO authenticated;
COMMIT;
