-- Add unique constraint on plaid_transaction_id for upsert to work
CREATE UNIQUE INDEX IF NOT EXISTS transactions_plaid_transaction_id_unique 
ON public.transactions (plaid_transaction_id) 
WHERE plaid_transaction_id IS NOT NULL;