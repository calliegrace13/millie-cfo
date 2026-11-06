-- Create a view that excludes the access_token for safe client-side access
CREATE OR REPLACE VIEW public.plaid_items_safe AS
SELECT 
  id,
  user_id,
  item_id,
  institution_id,
  institution_name,
  cursor,
  last_synced_at,
  created_at,
  updated_at
FROM public.plaid_items;

-- Enable RLS on the view
ALTER VIEW public.plaid_items_safe SET (security_invoker = on);

-- Grant SELECT on the view to authenticated users
GRANT SELECT ON public.plaid_items_safe TO authenticated;