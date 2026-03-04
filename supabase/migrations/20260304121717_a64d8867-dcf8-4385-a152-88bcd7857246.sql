
CREATE TABLE public.recipe_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_identifier text NOT NULL,
  identifier_type text NOT NULL,
  recipe_snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  recipient_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz
);

ALTER TABLE public.recipe_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Senders can view their shares"
  ON public.recipe_shares FOR SELECT
  USING (auth.uid() = sender_id);

CREATE POLICY "Senders can create shares"
  ON public.recipe_shares FOR INSERT
  WITH CHECK (auth.uid() = sender_id);
