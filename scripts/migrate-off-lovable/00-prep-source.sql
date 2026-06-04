-- À exécuter SUR LA SOURCE (éditeur SQL de Lovable Cloud) AVANT le dump.
-- Évite que le chargement des données échoue contre la contrainte CHECK de la cible
-- (qui n'autorise plus 'lovable').
UPDATE public.user_ai_settings
SET provider = 'anthropic'
WHERE provider = 'lovable';
