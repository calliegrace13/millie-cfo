-- Add new enum value first (must be committed separately)
ALTER TYPE cash_flow_category ADD VALUE IF NOT EXISTS 'other';
