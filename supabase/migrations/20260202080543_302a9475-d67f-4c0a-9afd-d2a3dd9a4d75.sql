-- Create a secure function to get the user's own webhook token
-- This provides an additional layer of security by explicitly controlling token access
CREATE OR REPLACE FUNCTION public.get_my_webhook_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ensure user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  
  -- Return the token for the authenticated user only
  RETURN (SELECT webhook_token FROM public.profiles WHERE id = auth.uid());
END;
$$;

-- Create a safe view of profiles that excludes sensitive fields
CREATE OR REPLACE VIEW public.profiles_safe AS
SELECT 
  id, 
  display_name, 
  avatar_url, 
  theme, 
  created_at, 
  updated_at
FROM public.profiles;

-- Grant access to the view for authenticated users
GRANT SELECT ON public.profiles_safe TO authenticated;