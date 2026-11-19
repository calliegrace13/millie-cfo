
-- 1. Realtime channel authorization: restrict subscriptions to user-scoped topics
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can subscribe to own topic"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() = ('notifications:' || auth.uid()::text)
);

CREATE POLICY "Authenticated users can broadcast to own topic"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() = ('notifications:' || auth.uid()::text)
);

-- 2. Make get_partner_user_id deterministic
CREATE OR REPLACE FUNCTION public.get_partner_user_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE 
    WHEN user_id = _user_id THEN partner_user_id
    ELSE user_id
  END
  FROM public.partner_links
  WHERE status = 'active'
    AND (user_id = _user_id OR partner_user_id = _user_id)
  ORDER BY linked_at DESC NULLS LAST, created_at DESC
  LIMIT 1
$function$;

-- Enforce one active partner link per user (both sides)
CREATE UNIQUE INDEX IF NOT EXISTS partner_links_one_active_per_user
  ON public.partner_links (user_id)
  WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS partner_links_one_active_per_partner
  ON public.partner_links (partner_user_id)
  WHERE status = 'active' AND partner_user_id IS NOT NULL;

-- 3. Add UPDATE policy for transaction_offsets, scoped to owning user via parent transaction
CREATE POLICY "Users can update own transaction offsets"
ON public.transaction_offsets
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = transaction_offsets.parent_transaction_id
      AND t.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = transaction_offsets.parent_transaction_id
      AND t.user_id = auth.uid()
  )
);

-- 4. Clear pairing_code when partner link becomes active (one-time use)
CREATE OR REPLACE FUNCTION public.clear_pairing_code_on_activate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'active' AND (OLD.status IS DISTINCT FROM 'active') THEN
    NEW.pairing_code := '';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clear_pairing_code_trigger ON public.partner_links;
CREATE TRIGGER clear_pairing_code_trigger
  BEFORE UPDATE ON public.partner_links
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_pairing_code_on_activate();

-- Also clear codes on existing active rows
UPDATE public.partner_links SET pairing_code = '' WHERE status = 'active' AND pairing_code <> '';

