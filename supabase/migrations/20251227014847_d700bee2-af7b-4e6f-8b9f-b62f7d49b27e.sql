-- Add income_type column to transaction_rules
ALTER TABLE public.transaction_rules 
ADD COLUMN income_type text CHECK (income_type IN ('salary', 'other'));