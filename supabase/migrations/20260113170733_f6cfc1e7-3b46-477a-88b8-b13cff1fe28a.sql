-- Drop the overly permissive policies on recipe-images bucket
DROP POLICY IF EXISTS "Allow uploads to recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Allow delete recipe images" ON storage.objects;

-- Create secure policies that require authentication
CREATE POLICY "Authenticated users can upload recipe images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'recipe-images');

CREATE POLICY "Authenticated users can delete recipe images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'recipe-images');

CREATE POLICY "Authenticated users can update recipe images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'recipe-images');