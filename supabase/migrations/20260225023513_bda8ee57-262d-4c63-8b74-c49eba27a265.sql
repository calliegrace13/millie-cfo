
-- Drop the existing UPDATE policy
DROP POLICY "Users can update own partner links" ON public.partner_links;

-- Create a new UPDATE policy that also allows claiming pending links
CREATE POLICY "Users can update own partner links"
ON public.partner_links
FOR UPDATE
USING (
  (auth.uid() = user_id) 
  OR (auth.uid() = partner_user_id)
  OR (status = 'pending')
);
