-- Create table for storing user culinary preferences
CREATE TABLE public.user_culinary_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  
  -- Taste preferences (liked/disliked flavors, ingredients)
  taste_preferences JSONB NOT NULL DEFAULT '{
    "liked_flavors": [],
    "disliked_flavors": [],
    "liked_ingredients": [],
    "disliked_ingredients": []
  }'::jsonb,
  
  -- Kitchen equipment (available/unavailable)
  kitchen_equipment JSONB NOT NULL DEFAULT '{
    "available": [],
    "unavailable": []
  }'::jsonb,
  
  -- Culinary style (favorite cuisines, techniques, difficulty)
  culinary_style JSONB NOT NULL DEFAULT '{
    "favorite_cuisines": [],
    "favorite_techniques": [],
    "preferred_difficulty": null
  }'::jsonb,
  
  -- Dietary constraints (allergies, diets, restrictions)
  dietary_constraints JSONB NOT NULL DEFAULT '{
    "allergies": [],
    "diets": [],
    "restrictions": []
  }'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_culinary_preferences ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only access their own preferences
CREATE POLICY "Users can view their own preferences"
ON public.user_culinary_preferences
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
ON public.user_culinary_preferences
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
ON public.user_culinary_preferences
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own preferences"
ON public.user_culinary_preferences
FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_user_culinary_preferences_updated_at
BEFORE UPDATE ON public.user_culinary_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();