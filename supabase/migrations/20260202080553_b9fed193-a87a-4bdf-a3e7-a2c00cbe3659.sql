-- Drop the SECURITY DEFINER view as it's not needed
-- The get_my_webhook_token() function provides secure access to the token
-- And the existing profiles RLS policies already protect user data properly
DROP VIEW IF EXISTS public.profiles_safe;