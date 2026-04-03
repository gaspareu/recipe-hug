-- Targeted lookup of a user ID by phone number, without exposing auth.users broadly.
-- SECURITY DEFINER runs with the privileges of the function owner (postgres),
-- so it can read auth.users. The function returns only the UUID, never PII.
CREATE OR REPLACE FUNCTION public.get_user_id_by_phone(phone_number TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found_id UUID;
BEGIN
  SELECT id INTO found_id
  FROM auth.users
  WHERE phone = phone_number
  LIMIT 1;

  RETURN found_id; -- NULL if not found
END;
$$;

-- Only the service role (edge functions) should call this function.
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_phone(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_phone(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_phone(TEXT) TO service_role;
