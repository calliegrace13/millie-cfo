ALTER TABLE public.gifts ADD COLUMN transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL;
