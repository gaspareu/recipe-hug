CREATE OR REPLACE VIEW public.profiles_safe
WITH (security_invoker = true) AS
SELECT id, display_name, avatar_url, theme, created_at, updated_at
FROM public.profiles;