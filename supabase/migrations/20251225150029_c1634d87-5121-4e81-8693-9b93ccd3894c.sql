-- Add column to link amortization schedules to the original transaction
ALTER TABLE amortization_schedules ADD COLUMN IF NOT EXISTS transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL;

-- Add column to mark if a transaction is amortized (excluded from direct income statement)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_amortized boolean DEFAULT false;