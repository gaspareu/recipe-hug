-- Create storage bucket for recipe images
INSERT INTO storage.buckets (id, name, public)
VALUES ('recipe-images', 'recipe-images', true);

-- Allow public access to view images
CREATE POLICY "Public read access for recipe images"
ON storage.objects FOR SELECT
USING (bucket_id = 'recipe-images');

-- Allow anyone to upload images (MVP - no auth)
CREATE POLICY "Allow uploads to recipe images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'recipe-images');

-- Allow anyone to delete their uploaded images
CREATE POLICY "Allow delete recipe images"
ON storage.objects FOR DELETE
USING (bucket_id = 'recipe-images');