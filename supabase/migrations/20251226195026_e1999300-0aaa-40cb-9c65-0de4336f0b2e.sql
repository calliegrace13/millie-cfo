-- First, delete duplicate transactions keeping only one copy (the oldest by created_at)
DELETE FROM transactions 
WHERE id NOT IN (
  SELECT DISTINCT ON (plaid_transaction_id) id 
  FROM transactions 
  WHERE plaid_transaction_id IS NOT NULL 
  ORDER BY plaid_transaction_id, created_at ASC
)
AND plaid_transaction_id IS NOT NULL;

-- Add unique constraint on plaid_transaction_id to prevent future duplicates
-- Note: This allows NULL values (for manual transactions)
CREATE UNIQUE INDEX IF NOT EXISTS transactions_plaid_transaction_id_unique 
ON transactions (plaid_transaction_id) 
WHERE plaid_transaction_id IS NOT NULL;