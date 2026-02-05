-- Add a JSONB column to store API keys per provider
-- Structure: { "gemini": "key1", "openai": "key2", "anthropic": "key3" }
ALTER TABLE public.user_ai_settings 
ADD COLUMN IF NOT EXISTS provider_api_keys jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Migrate existing api_key to the new structure if provider is not lovable
-- This preserves existing user data
UPDATE public.user_ai_settings 
SET provider_api_keys = jsonb_build_object(provider, api_key)
WHERE api_key IS NOT NULL AND provider != 'lovable';

-- Add comment for documentation
COMMENT ON COLUMN public.user_ai_settings.provider_api_keys IS 'Stores API keys per provider: { "gemini": "...", "openai": "...", "anthropic": "..." }';