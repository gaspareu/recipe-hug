-- Table recipes avec tous les champs du brief
CREATE TABLE public.recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  is_favorite BOOLEAN DEFAULT false,
  servings INTEGER,
  ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  season TEXT,
  nutrition_tags TEXT[],
  calorie_score NUMERIC,
  ai_summary TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour updated_at
CREATE TRIGGER update_recipes_updated_at
  BEFORE UPDATE ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index pour les requêtes fréquentes
CREATE INDEX idx_recipes_user_id ON public.recipes(user_id);
CREATE INDEX idx_recipes_status ON public.recipes(status);
CREATE INDEX idx_recipes_is_favorite ON public.recipes(is_favorite);

-- RLS désactivé pour le MVP (usage perso)
ALTER TABLE public.recipes DISABLE ROW LEVEL SECURITY;