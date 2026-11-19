-- Add income_type column to transactions for categorizing income as salary vs other
ALTER TABLE public.transactions 
ADD COLUMN income_type text CHECK (income_type IN ('salary', 'other'));

-- Add a comment for clarity
COMMENT ON COLUMN public.transactions.income_type IS 'Categorizes income transactions as salary or other';
