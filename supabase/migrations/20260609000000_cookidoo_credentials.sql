-- Identifiants Cookidoo par utilisateur (export de recettes vers Thermomix).
-- Le mot de passe est chiffré côté serveur (AES-GCM, secret AI_KEYS_ENCRYPTION_SECRET)
-- avant insertion : la colonne password_enc ne contient jamais de clair.
CREATE TABLE public.user_cookidoo_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  email TEXT NOT NULL,
  password_enc TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'fr',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS : chaque utilisateur n'accède qu'à ses propres identifiants
ALTER TABLE public.user_cookidoo_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own Cookidoo credentials"
ON public.user_cookidoo_credentials
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Cookidoo credentials"
ON public.user_cookidoo_credentials
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Cookidoo credentials"
ON public.user_cookidoo_credentials
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Cookidoo credentials"
ON public.user_cookidoo_credentials
FOR DELETE
USING (auth.uid() = user_id);

-- Maj automatique de updated_at
CREATE TRIGGER update_user_cookidoo_credentials_updated_at
BEFORE UPDATE ON public.user_cookidoo_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Vue « safe » : n'expose jamais password_enc (jamais lu côté client).
-- security_invoker = true → la vue respecte la RLS de l'appelant.
CREATE OR REPLACE VIEW public.user_cookidoo_credentials_safe
WITH (security_invoker = true) AS
SELECT id, user_id, email, country, created_at, updated_at
FROM public.user_cookidoo_credentials;
