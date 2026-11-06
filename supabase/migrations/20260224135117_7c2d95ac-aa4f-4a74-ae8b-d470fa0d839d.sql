
-- Table to store which expense categories should be classified as COGS
CREATE TABLE public.cogs_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  category_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique constraint so a user can't add the same category twice
ALTER TABLE public.cogs_categories ADD CONSTRAINT cogs_categories_user_category_unique UNIQUE (user_id, category_name);

ALTER TABLE public.cogs_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cogs categories" ON public.cogs_categories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own cogs categories" ON public.cogs_categories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own cogs categories" ON public.cogs_categories FOR DELETE USING (auth.uid() = user_id);
