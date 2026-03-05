CREATE OR REPLACE VIEW public.user_ai_settings_safe
WITH (security_invoker = true) AS
SELECT id, user_id, provider, preferred_model, agent_configs, created_at, updated_at
FROM public.user_ai_settings;