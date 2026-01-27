-- Add theme preference column to profiles
ALTER TABLE public.profiles 
ADD COLUMN theme text DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system'));