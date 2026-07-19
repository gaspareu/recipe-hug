-- Journal des exports Cookidoo.
--
-- Sert deux usages avec une seule source de vérité :
--   1. suivi d'état — le front interroge la ligne pour savoir quand l'export
--      asynchrone est terminé et afficher le bon retour ;
--   2. journal d'analyse — `diagnostics` conserve la qualité du contenu envoyé,
--      ce qui permet de répondre après coup à « pourquoi la recette est mal
--      configurée sur Cookidoo » sans refaire un export en observant le réseau.
CREATE TABLE public.cookidoo_exports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  recipe_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'success', 'failed')),
  cookidoo_recipe_id TEXT,
  cookidoo_url TEXT,
  updated BOOLEAN NOT NULL DEFAULT false,
  error_code TEXT,
  error_message TEXT,
  warnings TEXT[] NOT NULL DEFAULT '{}',
  unguided_steps INT[] NOT NULL DEFAULT '{}',
  diagnostics JSONB,
  duration_ms INT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  finished_at TIMESTAMP WITH TIME ZONE
);

-- Interrogation par le front : « ma ligne, par id ». Index sur le propriétaire
-- pour les requêtes d'analyse (historique des exports d'un utilisateur).
CREATE INDEX cookidoo_exports_user_created_idx
  ON public.cookidoo_exports (user_id, created_at DESC);

ALTER TABLE public.cookidoo_exports ENABLE ROW LEVEL SECURITY;

-- Lecture seule pour le propriétaire. Aucune policy d'écriture : les insertions
-- et mises à jour passent exclusivement par l'edge function en service role,
-- qui contourne la RLS. Un client ne peut donc pas fabriquer de fausse entrée
-- de journal ni maquiller un échec en succès.
CREATE POLICY "Users can view their own Cookidoo exports"
ON public.cookidoo_exports
FOR SELECT
USING (auth.uid() = user_id);

COMMENT ON TABLE public.cookidoo_exports IS
  'Journal des exports vers Cookidoo : suivi d''état pour le front, diagnostic de qualité pour l''analyse.';
COMMENT ON COLUMN public.cookidoo_exports.diagnostics IS
  'Qualité du payload envoyé : steps_total, steps_with_tm7, steps_guided, annotations, ingredients_count, has_image, tools.';
COMMENT ON COLUMN public.cookidoo_exports.unguided_steps IS
  'Index des étapes dont Cookidoo a dégradé les annotations en simple texte (vue appareil).';
COMMENT ON COLUMN public.cookidoo_exports.finished_at IS
  'Nul sur une ligne pending : une ligne pending ancienne signale un isolate tué avant la fin.';
