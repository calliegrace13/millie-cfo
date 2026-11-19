-- Add period column to budgets table for monthly or yearly tracking
ALTER TABLE public.budgets 
ADD COLUMN period text NOT NULL DEFAULT 'monthly' CHECK (period IN ('monthly', 'yearly'));
