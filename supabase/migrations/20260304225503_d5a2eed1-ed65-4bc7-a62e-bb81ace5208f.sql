
-- Fix the 'recipes' storage bucket: replace permissive policies with owner-scoped ones
DROP POLICY IF EXISTS "Users can update recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete recipe images" ON storage.objects;

CREATE POLICY "Users can update their own images (recipes bucket)"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'recipes' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own images (recipes bucket)"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'recipes' AND (storage.foldername(name))[1] = auth.uid()::text);
