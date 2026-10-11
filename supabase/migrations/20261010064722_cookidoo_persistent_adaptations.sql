-- Copies privées : aucune adaptation ne remplace la recette du Livre.
CREATE TABLE public.recipe_cookidoo_adaptations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  source_fingerprint text NOT NULL,
  adapter_version text NOT NULL,
  status text NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing','ready','needs_input','failed')),
  adapted_recipe jsonb,
  changes text[] NOT NULL DEFAULT '{}',
  notes text[] NOT NULL DEFAULT '{}',
  blockers text[] NOT NULL DEFAULT '{}',
  error_code text,
  attempt_id uuid NOT NULL DEFAULT gen_random_uuid(),
  lease_until timestamptz NOT NULL DEFAULT (now() + interval '2 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, recipe_id, source_fingerprint, adapter_version)
);
CREATE INDEX recipe_cookidoo_adaptations_recipe_idx ON public.recipe_cookidoo_adaptations(recipe_id);
ALTER TABLE public.recipe_cookidoo_adaptations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recipe_cookidoo_adaptations FROM anon, authenticated;
GRANT SELECT ON public.recipe_cookidoo_adaptations TO authenticated;
GRANT ALL ON public.recipe_cookidoo_adaptations TO service_role;
CREATE POLICY "Lire ses adaptations Cookidoo" ON public.recipe_cookidoo_adaptations
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id AND EXISTS (
    SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.user_id = (SELECT auth.uid())
  ));

ALTER TABLE public.recipes ADD COLUMN cookidoo_remote_fingerprint text;
ALTER TABLE public.cookidoo_exports ADD COLUMN adaptation_id uuid REFERENCES public.recipe_cookidoo_adaptations(id) ON DELETE SET NULL;
ALTER TABLE public.cookidoo_exports ADD COLUMN phase text NOT NULL DEFAULT 'sending';
ALTER TABLE public.cookidoo_exports ADD COLUMN expected_payload jsonb;
ALTER TABLE public.cookidoo_exports DROP CONSTRAINT cookidoo_exports_status_check;
ALTER TABLE public.cookidoo_exports ADD CONSTRAINT cookidoo_exports_status_check CHECK (status IN ('pending','success','failed','unknown'));
-- Ne pas ajouter d'index unique sur le journal historique : les réservations
-- suivantes verrouillent la recette et prennent en compte les anciennes lignes.
CREATE INDEX cookidoo_exports_recipe_status_idx ON public.cookidoo_exports(recipe_id, status);
CREATE INDEX cookidoo_exports_adaptation_idx ON public.cookidoo_exports(adaptation_id);

CREATE FUNCTION public.claim_cookidoo_adaptation(p_user_id uuid, p_recipe_id uuid, p_fingerprint text, p_version text, p_retry boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public.recipe_cookidoo_adaptations; acquired boolean := false;
BEGIN
  PERFORM 1 FROM public.recipes WHERE id = p_recipe_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recipe_not_found'; END IF;
  SELECT * INTO a FROM public.recipe_cookidoo_adaptations WHERE user_id=p_user_id AND recipe_id=p_recipe_id AND source_fingerprint=p_fingerprint AND adapter_version=p_version FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.recipe_cookidoo_adaptations(user_id,recipe_id,source_fingerprint,adapter_version)
      VALUES(p_user_id,p_recipe_id,p_fingerprint,p_version) RETURNING * INTO a;
    acquired := true;
  ELSIF (a.status='preparing' AND a.lease_until < now()) OR a.status='failed' OR (p_retry AND a.status='needs_input') THEN
    UPDATE public.recipe_cookidoo_adaptations SET status='preparing', attempt_id=gen_random_uuid(), lease_until=now()+interval '2 minutes', error_code=null, updated_at=now()
      WHERE id=a.id RETURNING * INTO a;
    acquired := true;
  END IF;
  RETURN jsonb_build_object('adaptation',to_jsonb(a),'acquired',acquired);
END $$;
REVOKE ALL ON FUNCTION public.claim_cookidoo_adaptation(uuid,uuid,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_cookidoo_adaptation(uuid,uuid,text,text,boolean) TO service_role;

CREATE FUNCTION public.begin_cookidoo_export(p_user_id uuid, p_recipe_id uuid, p_adaptation_id uuid, p_revision timestamptz, p_payload jsonb, p_diagnostics jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.recipes; j public.cookidoo_exports;
BEGIN
  SELECT * INTO r FROM public.recipes WHERE id=p_recipe_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recipe_not_found'; END IF;
  IF r.updated_at IS DISTINCT FROM p_revision THEN RETURN jsonb_build_object('error','source_changed'); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.recipe_cookidoo_adaptations WHERE id=p_adaptation_id AND recipe_id=p_recipe_id AND user_id=p_user_id AND status='ready') THEN
    RETURN jsonb_build_object('error','preparation_required');
  END IF;
  SELECT * INTO j FROM public.cookidoo_exports WHERE recipe_id=p_recipe_id AND user_id=p_user_id AND status IN ('pending','unknown') ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('job',to_jsonb(j),'acquired',false); END IF;
  INSERT INTO public.cookidoo_exports(user_id,recipe_id,adaptation_id,expected_payload,diagnostics)
    VALUES(p_user_id,p_recipe_id,p_adaptation_id,p_payload,p_diagnostics) RETURNING * INTO j;
  RETURN jsonb_build_object('job',to_jsonb(j),'acquired',true);
END $$;
REVOKE ALL ON FUNCTION public.begin_cookidoo_export(uuid,uuid,uuid,timestamptz,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_cookidoo_export(uuid,uuid,uuid,timestamptz,jsonb,jsonb) TO service_role;
