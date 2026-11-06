-- Add account_name column to preserve account info even after account is deleted
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_name text;

-- Update existing transactions with their account names
UPDATE transactions t
SET account_name = a.name
FROM accounts a
WHERE t.account_id = a.id AND t.account_name IS NULL;

-- Drop the existing foreign key constraint
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_account_id_fkey;

-- Re-add with ON DELETE SET NULL so transactions remain when account is deleted
ALTER TABLE transactions 
ADD CONSTRAINT transactions_account_id_fkey 
FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL;