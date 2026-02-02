-- Add agent_configs column to user_ai_settings for per-agent AI configuration
ALTER TABLE public.user_ai_settings 
ADD COLUMN IF NOT EXISTS agent_configs JSONB DEFAULT '{}'::jsonb;

-- Add a comment explaining the structure
COMMENT ON COLUMN public.user_ai_settings.agent_configs IS 'Per-agent AI configuration. Structure: { "agent_type": { "provider": "...", "model": "..." } }. Agent types: chat, create_recipe, cooking, edit_recipe, generate_image, parse_image, timeline, webhook';