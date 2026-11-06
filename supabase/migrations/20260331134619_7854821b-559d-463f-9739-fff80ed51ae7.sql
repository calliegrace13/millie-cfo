-- Fix: Restrict partner_links code lookup to authenticated users only
DROP POLICY IF EXISTS "Anyone can find pending link by code" ON public.partner_links;

CREATE POLICY "Authenticated users can find pending link by code"
  ON public.partner_links FOR SELECT
  USING (auth.uid() IS NOT NULL AND status = 'pending');