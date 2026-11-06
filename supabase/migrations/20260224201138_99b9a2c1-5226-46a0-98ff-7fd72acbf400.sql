
-- Gifts table for tracking gifts given/received
CREATE TABLE public.gifts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  occasion TEXT,
  description TEXT NOT NULL,
  amount NUMERIC,
  gift_date DATE NOT NULL DEFAULT CURRENT_DATE,
  direction TEXT NOT NULL DEFAULT 'given', -- 'given' or 'received'
  status TEXT NOT NULL DEFAULT 'idea', -- 'idea', 'purchased', 'given', 'received'
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.gifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own gifts" ON public.gifts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own gifts" ON public.gifts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own gifts" ON public.gifts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own gifts" ON public.gifts FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_gifts_updated_at BEFORE UPDATE ON public.gifts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
