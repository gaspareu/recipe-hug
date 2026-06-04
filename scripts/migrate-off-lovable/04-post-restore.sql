-- À exécuter SUR LA CIBLE après 03-copy-data.sh.
-- Le nouveau projet a un AI_KEYS_ENCRYPTION_SECRET différent : les clés API utilisateur
-- chiffrées importées sont devenues illisibles -> on les vide pour une re-saisie propre.
UPDATE public.user_ai_settings
SET provider_api_keys = '{}'::jsonb,
    api_key = NULL;

-- Garde-fou : aucune ligne ne doit rester sur un provider obsolète.
UPDATE public.user_ai_settings
SET provider = 'anthropic'
WHERE provider NOT IN ('anthropic', 'gemini', 'openai');

-- Vérifications rapides (les comptes doivent correspondre à la source).
SELECT 'auth.users' AS tbl, count(*) FROM auth.users
UNION ALL SELECT 'recipes', count(*) FROM public.recipes
UNION ALL SELECT 'meal_plans', count(*) FROM public.meal_plans
UNION ALL SELECT 'profiles', count(*) FROM public.profiles
UNION ALL SELECT 'user_ai_settings', count(*) FROM public.user_ai_settings;
