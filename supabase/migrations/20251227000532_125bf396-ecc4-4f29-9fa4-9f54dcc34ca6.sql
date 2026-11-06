-- Add deferred_income to the amortization_type enum
ALTER TYPE public.amortization_type ADD VALUE IF NOT EXISTS 'deferred_income';