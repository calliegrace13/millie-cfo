-- Add is_one_time column to amortization_schedules for non-GAAP exclusions
ALTER TABLE public.amortization_schedules 
ADD COLUMN is_one_time boolean DEFAULT false;
