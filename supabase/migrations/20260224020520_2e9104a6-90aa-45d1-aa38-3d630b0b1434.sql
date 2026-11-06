-- Add budget_scope column to budgets table
-- Values: 'all' (both), 'personal' (non-joint only), 'joint' (joint accounts only)
ALTER TABLE public.budgets
ADD COLUMN budget_scope text NOT NULL DEFAULT 'all';
