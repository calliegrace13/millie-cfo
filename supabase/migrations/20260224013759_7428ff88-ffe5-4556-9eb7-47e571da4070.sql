-- Add per-transaction ownership override
ALTER TABLE public.transactions ADD COLUMN ownership_pct numeric DEFAULT NULL;

COMMENT ON COLUMN public.transactions.ownership_pct IS 'Per-transaction ownership percentage override (0-100). NULL means use account default.';
