-- Revoke direct SELECT access to access_token column from authenticated users
-- The access_token should only be accessed via service role in edge functions
REVOKE SELECT (access_token) ON public.plaid_items FROM authenticated;

-- Add a comment to document the security requirement
COMMENT ON COLUMN public.plaid_items.access_token IS 'SENSITIVE: Only accessible via service role in edge functions. Never expose to client.';

-- Ensure the plaid_items_safe view is the only way clients can query Plaid items
COMMENT ON VIEW public.plaid_items_safe IS 'Safe view that excludes access_token for client-side queries. Use this instead of plaid_items table.';