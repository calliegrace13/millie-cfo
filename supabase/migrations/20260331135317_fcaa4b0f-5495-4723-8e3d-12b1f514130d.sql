
-- 1. FIX PARTNER_LINKS
DROP POLICY IF EXISTS "Authenticated users can find pending link by code" ON public.partner_links;
DROP POLICY IF EXISTS "Anyone can find pending link by code" ON public.partner_links;

DROP POLICY IF EXISTS "Users can update own partner links" ON public.partner_links;
CREATE POLICY "Users can update own partner links"
  ON public.partner_links FOR UPDATE
  USING (auth.uid() = user_id OR auth.uid() = partner_user_id);

CREATE OR REPLACE FUNCTION public.redeem_partner_code(_code text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _link record;
  _user_id uuid := auth.uid();
BEGIN
  IF _user_id IS NULL THEN
    RETURN json_build_object('error', 'Not authenticated');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.partner_links
    WHERE status = 'active' AND (user_id = _user_id OR partner_user_id = _user_id)
  ) THEN
    RETURN json_build_object('error', 'You already have an active partner link');
  END IF;
  SELECT * INTO _link
  FROM public.partner_links
  WHERE pairing_code = upper(_code) AND status = 'pending'
  LIMIT 1;
  IF _link IS NULL THEN
    RETURN json_build_object('error', 'Invalid or expired code');
  END IF;
  IF _link.user_id = _user_id THEN
    RETURN json_build_object('error', 'You cannot use your own code');
  END IF;
  UPDATE public.partner_links
  SET partner_user_id = _user_id, status = 'active', linked_at = now(), updated_at = now()
  WHERE id = _link.id;
  RETURN json_build_object('success', true, 'id', _link.id);
END;
$$;

-- 2. LOCK DOWN PLAID_ITEMS
DROP POLICY IF EXISTS "Users can view own plaid items" ON public.plaid_items;
DROP POLICY IF EXISTS "Users can insert own plaid items" ON public.plaid_items;
DROP POLICY IF EXISTS "Users can update own plaid items" ON public.plaid_items;
DROP POLICY IF EXISTS "Users can delete own plaid items" ON public.plaid_items;
CREATE POLICY "No direct access to plaid items" ON public.plaid_items FOR SELECT USING (false);
CREATE POLICY "No direct insert to plaid items" ON public.plaid_items FOR INSERT WITH CHECK (false);
CREATE POLICY "No direct update to plaid items" ON public.plaid_items FOR UPDATE USING (false);
CREATE POLICY "No direct delete to plaid items" ON public.plaid_items FOR DELETE USING (false);

-- 3. ADD MISSING UPDATE POLICY ON COGS_CATEGORIES
CREATE POLICY "Users can update own cogs categories"
  ON public.cogs_categories FOR UPDATE
  USING (auth.uid() = user_id);
