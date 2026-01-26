-- Add webhook_token column to profiles table
ALTER TABLE public.profiles
ADD COLUMN webhook_token text UNIQUE;

-- Create index for fast token lookup
CREATE INDEX idx_profiles_webhook_token ON public.profiles(webhook_token) WHERE webhook_token IS NOT NULL;

-- Create function to generate webhook token
CREATE OR REPLACE FUNCTION public.generate_webhook_token(user_uuid uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_token text;
BEGIN
  -- Generate a new UUID token
  new_token := gen_random_uuid()::text;
  
  -- Update the user's profile with the new token
  UPDATE public.profiles
  SET webhook_token = new_token, updated_at = now()
  WHERE id = user_uuid;
  
  RETURN new_token;
END;
$$;