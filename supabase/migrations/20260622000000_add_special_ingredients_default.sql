-- Aligne le défaut JSONB de taste_preferences avec le modèle applicatif :
-- special_ingredients (« aliments du moment ») a été ajouté côté code (front + edge)
-- mais manquait dans le DEFAULT de la table et dans les lignes déjà créées.

-- 1) Défaut pour les futures lignes
ALTER TABLE public.user_culinary_preferences
  ALTER COLUMN taste_preferences SET DEFAULT '{
    "liked_flavors": [],
    "disliked_flavors": [],
    "liked_ingredients": [],
    "disliked_ingredients": [],
    "special_ingredients": []
  }'::jsonb;

-- 2) Backfill non destructif : ajoute la clé manquante sans toucher les valeurs existantes
UPDATE public.user_culinary_preferences
SET taste_preferences = taste_preferences || jsonb_build_object('special_ingredients', '[]'::jsonb)
WHERE NOT (taste_preferences ? 'special_ingredients');
