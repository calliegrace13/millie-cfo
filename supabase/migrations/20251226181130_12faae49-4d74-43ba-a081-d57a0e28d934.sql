-- Add unique constraint on plaid_transaction_id for upsert operations
CREATE UNIQUE INDEX IF NOT EXISTS transactions_plaid_transaction_id_key 
ON public.transactions (plaid_transaction_id) 
WHERE plaid_transaction_id IS NOT NULL;