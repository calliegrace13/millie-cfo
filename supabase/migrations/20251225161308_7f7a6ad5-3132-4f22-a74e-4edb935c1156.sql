-- Add is_deleted column for soft delete
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;

-- Add deleted_at timestamp to track when account was deleted
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;
