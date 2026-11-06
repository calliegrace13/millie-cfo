
-- Store Google Calendar OAuth tokens per user
CREATE TABLE public.google_calendar_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  calendar_id TEXT DEFAULT 'primary',
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.google_calendar_tokens ENABLE ROW LEVEL SECURITY;

-- Users should NOT be able to SELECT tokens directly (sensitive data)
-- Only edge functions with service role can access
CREATE POLICY "No direct access to google tokens" ON public.google_calendar_tokens FOR SELECT USING (false);
CREATE POLICY "No direct insert to google tokens" ON public.google_calendar_tokens FOR INSERT WITH CHECK (false);
CREATE POLICY "No direct update to google tokens" ON public.google_calendar_tokens FOR UPDATE USING (false);
CREATE POLICY "No direct delete to google tokens" ON public.google_calendar_tokens FOR DELETE USING (false);

-- View to expose only safe fields to the user
CREATE VIEW public.google_calendar_status
WITH (security_invoker = on) AS
  SELECT user_id, calendar_id, last_synced_at, created_at
  FROM public.google_calendar_tokens
  WHERE user_id = auth.uid();

CREATE TRIGGER update_google_calendar_tokens_updated_at
  BEFORE UPDATE ON public.google_calendar_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add google_event_id to calendar events for sync tracking
ALTER TABLE public.ceo_calendar_events ADD COLUMN google_event_id TEXT;
CREATE INDEX idx_ceo_calendar_events_google_id ON public.ceo_calendar_events (google_event_id) WHERE google_event_id IS NOT NULL;
