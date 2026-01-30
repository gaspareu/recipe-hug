-- Fix 1: Add authorization check to generate_webhook_token function
-- This prevents any authenticated user from generating tokens for other users

CREATE OR REPLACE FUNCTION public.generate_webhook_token(user_uuid uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_token text;
BEGIN
  -- Authorization: only allow users to generate tokens for themselves
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  
  IF auth.uid() != user_uuid THEN
    RAISE EXCEPTION 'unauthorized: cannot generate token for other users';
  END IF;
  
  -- Generate a new UUID token
  new_token := gen_random_uuid()::text;
  
  -- Update the user's profile with the new token
  UPDATE public.profiles
  SET webhook_token = new_token, updated_at = now()
  WHERE id = user_uuid;
  
  RETURN new_token;
END;
$$;

-- Fix 2: Replace overly permissive storage policies with owner-scoped policies
-- Drop the old permissive policies
DROP POLICY IF EXISTS "Authenticated users can upload recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update recipe images" ON storage.objects;

-- Create owner-scoped policies that require files to be in user's own folder
CREATE POLICY "Users can upload their own recipe images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'recipe-images' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own recipe images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'recipe-images' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their own recipe images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'recipe-images' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);