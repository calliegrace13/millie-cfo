
-- Daily health metrics table for steps, heart rate, sleep, nutrition
CREATE TABLE public.daily_health_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  metric_date DATE NOT NULL,
  -- Steps & Activity
  steps INTEGER NULL,
  distance_km NUMERIC NULL,
  active_energy_cal NUMERIC NULL,
  -- Heart Rate
  resting_heart_rate INTEGER NULL,
  avg_heart_rate INTEGER NULL,
  max_heart_rate INTEGER NULL,
  -- Sleep
  sleep_hours NUMERIC NULL,
  sleep_quality TEXT NULL, -- 'poor', 'fair', 'good', 'excellent'
  bedtime TIME NULL,
  wake_time TIME NULL,
  -- Nutrition (manual or imported)
  calories_consumed NUMERIC NULL,
  protein_grams NUMERIC NULL,
  carbs_grams NUMERIC NULL,
  fat_grams NUMERIC NULL,
  water_ml NUMERIC NULL,
  -- Meta
  source TEXT NOT NULL DEFAULT 'manual',
  notes TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, metric_date)
);

-- Enable RLS
ALTER TABLE public.daily_health_metrics ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own health metrics"
  ON public.daily_health_metrics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own health metrics"
  ON public.daily_health_metrics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own health metrics"
  ON public.daily_health_metrics FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own health metrics"
  ON public.daily_health_metrics FOR DELETE
  USING (auth.uid() = user_id);

-- Index for fast date range queries
CREATE INDEX idx_health_metrics_user_date ON public.daily_health_metrics(user_id, metric_date DESC);

