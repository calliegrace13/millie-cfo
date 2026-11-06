-- Add date fields to events table for calendar integration
ALTER TABLE public.events ADD COLUMN event_date date;
ALTER TABLE public.events ADD COLUMN end_date date;