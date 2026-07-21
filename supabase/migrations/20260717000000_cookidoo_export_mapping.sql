-- Anti-doublon de l'export Cookidoo.
--
-- Sans mémorisation, chaque export recrée une recette dans « Mes recettes
-- créées » → doublons à chaque clic. On garde l'identifiant Cookidoo associé à
-- la recette pour la mettre à jour en place lors d'un ré-export.
--
-- RLS : les colonnes héritent des policies existantes de public.recipes
-- (isolation par user_id) — aucune policy supplémentaire nécessaire.

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS cookidoo_recipe_id text,
  ADD COLUMN IF NOT EXISTS cookidoo_exported_at timestamptz;

COMMENT ON COLUMN public.recipes.cookidoo_recipe_id IS
  'Identifiant de la recette correspondante dans « Mes recettes créées » Cookidoo (export TM7).';
COMMENT ON COLUMN public.recipes.cookidoo_exported_at IS
  'Date du dernier export réussi vers Cookidoo.';
