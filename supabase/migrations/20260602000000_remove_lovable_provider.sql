-- Retrait du fournisseur IA « lovable » : Anthropic devient le fournisseur par défaut.
-- La clé Anthropic est gérée côté serveur (secret ANTHROPIC_API_KEY), comme l'était la
-- passerelle Lovable. Les fournisseurs gemini/openai restent « bring your own key ».

-- 1. Migrer les lignes existantes encore positionnées sur 'lovable' vers 'anthropic'
UPDATE public.user_ai_settings
SET provider = 'anthropic'
WHERE provider = 'lovable';

-- 2. Changer la valeur par défaut de la colonne
ALTER TABLE public.user_ai_settings
  ALTER COLUMN provider SET DEFAULT 'anthropic';

-- 3. Mettre à jour la contrainte CHECK pour retirer 'lovable'
ALTER TABLE public.user_ai_settings
  DROP CONSTRAINT IF EXISTS user_ai_settings_provider_check;

ALTER TABLE public.user_ai_settings
  ADD CONSTRAINT user_ai_settings_provider_check
  CHECK (provider IN ('anthropic', 'gemini', 'openai'));
