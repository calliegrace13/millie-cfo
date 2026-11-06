
-- Add needs_review column to transactions
ALTER TABLE public.transactions ADD COLUMN needs_review boolean NOT NULL DEFAULT true;

-- Create index for efficient filtering
CREATE INDEX idx_transactions_needs_review ON public.transactions (needs_review) WHERE needs_review = true;

-- Mark transactions before Jan 1st 2025 as already reviewed
UPDATE public.transactions SET needs_review = false WHERE date < '2025-01-01';
