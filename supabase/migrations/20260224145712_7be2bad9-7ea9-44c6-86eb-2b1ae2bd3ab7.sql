
-- Events table
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Junction table linking transactions to events
CREATE TABLE public.transaction_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(transaction_id, event_id)
);

-- RLS for events
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own events" ON public.events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own events" ON public.events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own events" ON public.events FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own events" ON public.events FOR DELETE USING (auth.uid() = user_id);

-- RLS for transaction_events (user must own the event)
ALTER TABLE public.transaction_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transaction events" ON public.transaction_events FOR SELECT
  USING (event_id IN (SELECT id FROM public.events WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert own transaction events" ON public.transaction_events FOR INSERT
  WITH CHECK (event_id IN (SELECT id FROM public.events WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete own transaction events" ON public.transaction_events FOR DELETE
  USING (event_id IN (SELECT id FROM public.events WHERE user_id = auth.uid()));

-- Timestamp trigger for events
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
