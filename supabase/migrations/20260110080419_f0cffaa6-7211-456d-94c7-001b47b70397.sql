-- Create storage bucket for recipe images
INSERT INTO storage.buckets (id, name, public)
VALUES ('recipes', 'recipes', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload recipe images
CREATE POLICY "Users can upload recipe images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'recipes' AND (storage.foldername(name))[1] = 'recipe-images');

-- Allow anyone to view recipe images (public bucket)
CREATE POLICY "Recipe images are publicly accessible"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'recipes');

-- Allow authenticated users to update their recipe images
CREATE POLICY "Users can update recipe images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'recipes' AND (storage.foldername(name))[1] = 'recipe-images');

-- Allow authenticated users to delete recipe images
CREATE POLICY "Users can delete recipe images"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'recipes' AND (storage.foldername(name))[1] = 'recipe-images');