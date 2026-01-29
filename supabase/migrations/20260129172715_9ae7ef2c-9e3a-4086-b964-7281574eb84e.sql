-- Note: Since steps are stored as JSONB, we don't need a schema migration.
-- The Step interface will be extended to include:
--   duration_minutes: number (estimated time in minutes)
--   parallel_with: number[] (array of step orders that can run in parallel)
--
-- We'll add a new column to cache the analyzed timeline data for performance
ALTER TABLE public.recipes 
ADD COLUMN IF NOT EXISTS timeline_data jsonb DEFAULT NULL;

-- Add a comment to document the structure
COMMENT ON COLUMN public.recipes.timeline_data IS 'Cached timeline analysis: { analyzed_at: string, steps: [{ order: number, duration_minutes: number, parallel_with: number[], start_offset: number }] }';