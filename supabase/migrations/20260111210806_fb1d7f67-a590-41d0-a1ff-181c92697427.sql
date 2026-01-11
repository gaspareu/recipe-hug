-- Create a table for recipe version history
CREATE TABLE public.recipe_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  version_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  servings INTEGER,
  ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  season TEXT,
  nutrition_tags TEXT[],
  change_description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.recipe_versions ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own recipe versions" 
ON public.recipe_versions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create versions for their recipes" 
ON public.recipe_versions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recipe versions" 
ON public.recipe_versions 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_recipe_versions_recipe_id ON public.recipe_versions(recipe_id);
CREATE INDEX idx_recipe_versions_created_at ON public.recipe_versions(created_at DESC);