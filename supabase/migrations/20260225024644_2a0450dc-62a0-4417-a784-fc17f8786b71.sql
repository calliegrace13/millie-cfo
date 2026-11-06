
-- Add is_joint column to events
ALTER TABLE public.events ADD COLUMN is_joint boolean DEFAULT false;

-- Partner can view joint events
CREATE POLICY "Partners can view joint events"
ON public.events
FOR SELECT
USING (is_joint = true AND user_id = get_partner_user_id(auth.uid()));

-- Partner can update joint events
CREATE POLICY "Partners can update joint events"
ON public.events
FOR UPDATE
USING (is_joint = true AND user_id = get_partner_user_id(auth.uid()));

-- Partner can delete joint events
CREATE POLICY "Partners can delete joint events"
ON public.events
FOR DELETE
USING (is_joint = true AND user_id = get_partner_user_id(auth.uid()));
