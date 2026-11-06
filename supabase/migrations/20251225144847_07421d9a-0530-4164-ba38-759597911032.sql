-- Add recognition_date column for accrual accounting (when expense hits income statement)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recognition_date date;

-- Set default recognition_date to match transaction date for existing records
UPDATE transactions SET recognition_date = date WHERE recognition_date IS NULL;