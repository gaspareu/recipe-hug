-- Les recettes historiques restent sans classification jusqu'à une revue humaine.
ALTER TABLE public.recipes ADD COLUMN entry_kind text
  CHECK (entry_kind IN ('preparation', 'complete_dish'));
ALTER TABLE public.recipes ADD CONSTRAINT recipes_user_id_id_key UNIQUE (user_id, id);
CREATE INDEX recipes_user_kind_idx ON public.recipes (user_id, entry_kind);

CREATE TABLE public.recipe_pairing_profiles (
  recipe_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  roles text[] NOT NULL DEFAULT '{}',
  flavors text[] NOT NULL DEFAULT '{}',
  textures text[] NOT NULL DEFAULT '{}',
  equipment text[] NOT NULL DEFAULT '{}',
  allergens text[] NOT NULL DEFAULT '{}',
  allergen_review_state text NOT NULL DEFAULT 'unknown'
    CHECK (allergen_review_state IN ('unknown', 'reviewed')),
  dietary_compatibilities text[] NOT NULL DEFAULT '{}',
  dietary_exclusions text[] NOT NULL DEFAULT '{}',
  dietary_review_state text NOT NULL DEFAULT 'unknown'
    CHECK (dietary_review_state IN ('unknown', 'reviewed')),
  active_minutes integer CHECK (active_minutes >= 0),
  make_ahead boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipe_pairing_profiles_recipe_owner_fkey
    FOREIGN KEY (user_id, recipe_id) REFERENCES public.recipes (user_id, id) ON DELETE CASCADE
);
CREATE INDEX recipe_pairing_profiles_owner_idx ON public.recipe_pairing_profiles (user_id);

CREATE TABLE public.compositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('dish', 'menu')),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  servings integer NOT NULL DEFAULT 2 CHECK (servings > 0),
  assembly_steps jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(assembly_steps) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compositions_user_id_id_key UNIQUE (user_id, id)
);
CREATE INDEX compositions_owner_kind_idx ON public.compositions (user_id, kind, updated_at DESC);

CREATE TABLE public.composition_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  composition_id uuid NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  course text,
  notes text,
  recipe_id uuid,
  child_composition_id uuid,
  quantity_factor numeric NOT NULL DEFAULT 1 CHECK (quantity_factor > 0 AND quantity_factor <= 100),
  CONSTRAINT composition_items_one_target CHECK (num_nonnulls(recipe_id, child_composition_id) = 1),
  CONSTRAINT composition_items_position_key UNIQUE (composition_id, position),
  CONSTRAINT composition_items_parent_fkey FOREIGN KEY (user_id, composition_id)
    REFERENCES public.compositions (user_id, id) ON DELETE CASCADE,
  CONSTRAINT composition_items_recipe_fkey FOREIGN KEY (user_id, recipe_id)
    REFERENCES public.recipes (user_id, id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT composition_items_child_fkey FOREIGN KEY (user_id, child_composition_id)
    REFERENCES public.compositions (user_id, id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX composition_items_owner_parent_idx ON public.composition_items (user_id, composition_id);
CREATE INDEX composition_items_recipe_idx ON public.composition_items (user_id, recipe_id) WHERE recipe_id IS NOT NULL;
CREATE INDEX composition_items_child_idx ON public.composition_items (user_id, child_composition_id) WHERE child_composition_id IS NOT NULL;

CREATE FUNCTION public.validate_composition_item() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE parent_kind text;
DECLARE child_kind text;
BEGIN
  SELECT kind INTO parent_kind FROM public.compositions
    WHERE id = NEW.composition_id AND user_id = NEW.user_id;
  IF parent_kind IS NULL THEN RAISE EXCEPTION 'Composition parente introuvable'; END IF;
  IF parent_kind = 'dish' AND NEW.child_composition_id IS NOT NULL THEN
    RAISE EXCEPTION 'Un plat composé ne peut contenir que des fiches';
  END IF;
  IF NEW.child_composition_id IS NOT NULL THEN
    SELECT kind INTO child_kind FROM public.compositions
      WHERE id = NEW.child_composition_id AND user_id = NEW.user_id;
    IF child_kind IS DISTINCT FROM 'dish' THEN
      RAISE EXCEPTION 'Un menu ne peut contenir que des plats composés';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_composition_item_before_write
  BEFORE INSERT OR UPDATE ON public.composition_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_composition_item();

CREATE FUNCTION public.prevent_composition_kind_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.kind IS DISTINCT FROM OLD.kind THEN
    RAISE EXCEPTION 'Le type d’une composition ne peut pas être modifié';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER prevent_composition_kind_change_before_update
  BEFORE UPDATE ON public.compositions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_composition_kind_change();

CREATE TABLE public.pairing_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_recipe_id uuid,
  source_composition_id uuid,
  candidate_recipe_id uuid NOT NULL,
  signal text NOT NULL CHECK (signal IN ('relevant', 'not_for_me', 'hidden')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pairing_feedback_one_source CHECK (num_nonnulls(source_recipe_id, source_composition_id) = 1),
  CONSTRAINT pairing_feedback_source_recipe_fkey FOREIGN KEY (user_id, source_recipe_id)
    REFERENCES public.recipes (user_id, id) ON DELETE CASCADE,
  CONSTRAINT pairing_feedback_source_composition_fkey FOREIGN KEY (user_id, source_composition_id)
    REFERENCES public.compositions (user_id, id) ON DELETE CASCADE,
  CONSTRAINT pairing_feedback_candidate_fkey FOREIGN KEY (user_id, candidate_recipe_id)
    REFERENCES public.recipes (user_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX pairing_feedback_recipe_key ON public.pairing_feedback
  (user_id, source_recipe_id, candidate_recipe_id) WHERE source_recipe_id IS NOT NULL;
CREATE UNIQUE INDEX pairing_feedback_composition_key ON public.pairing_feedback
  (user_id, source_composition_id, candidate_recipe_id) WHERE source_composition_id IS NOT NULL;

-- Les anciennes lignes sont conservées. La propriété des recettes référencées
-- est validée ici ; l'exclusivité s'applique aux nouvelles écritures.
ALTER TABLE public.meal_plans ADD COLUMN composition_id uuid;
ALTER TABLE public.meal_plans ADD CONSTRAINT meal_plans_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.meal_plans DROP CONSTRAINT meal_plans_recipe_id_fkey;
ALTER TABLE public.meal_plans ADD CONSTRAINT meal_plans_recipe_owner_fkey
  FOREIGN KEY (user_id, recipe_id) REFERENCES public.recipes (user_id, id)
  ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE public.meal_plans ADD CONSTRAINT meal_plans_composition_owner_fkey
  FOREIGN KEY (user_id, composition_id) REFERENCES public.compositions (user_id, id)
  ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.meal_plans ADD CONSTRAINT meal_plans_one_target
  CHECK (num_nonnulls(recipe_id, composition_id) +
    (nullif(trim(custom_meal), '') IS NOT NULL)::integer = 1) NOT VALID;
CREATE INDEX meal_plans_recipe_owner_idx ON public.meal_plans (user_id, recipe_id) WHERE recipe_id IS NOT NULL;
CREATE INDEX meal_plans_composition_owner_idx ON public.meal_plans (user_id, composition_id) WHERE composition_id IS NOT NULL;
ALTER TABLE public.meal_plans VALIDATE CONSTRAINT meal_plans_recipe_owner_fkey;
-- D'anciens créneaux peuvent être vides après ON DELETE SET NULL sur recipe_id.
-- La contrainte protège les nouvelles écritures ; leur nettoyage sera fait
-- séparément, sans supprimer ni réécrire les anciennes lignes de l'utilisateur.
-- L'ancienne table n'avait pas de FK utilisateur : les créneaux orphelins
-- restent aussi en place, tandis que la nouvelle FK protège les écritures.

CREATE TRIGGER update_compositions_updated_at BEFORE UPDATE ON public.compositions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_recipe_pairing_profiles_updated_at BEFORE UPDATE ON public.recipe_pairing_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pairing_feedback_updated_at BEFORE UPDATE ON public.pairing_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Une écriture atomique évite qu'un échec laisse un plat ou menu incomplet.
CREATE FUNCTION public.save_composition(
  p_kind text, p_title text, p_servings integer,
  p_assembly_steps jsonb, p_items jsonb, p_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_id uuid;
DECLARE v_item jsonb;
DECLARE v_position integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Une composition doit contenir au moins un élément';
  END IF;
  IF jsonb_array_length(p_items) > 40 THEN RAISE EXCEPTION 'Trop d’éléments'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.compositions (user_id, kind, title, servings, assembly_steps)
      VALUES (auth.uid(), p_kind, p_title, p_servings, coalesce(p_assembly_steps, '[]'::jsonb))
      RETURNING id INTO v_id;
  ELSE
    UPDATE public.compositions SET title = p_title, servings = p_servings,
      assembly_steps = coalesce(p_assembly_steps, '[]'::jsonb)
      WHERE id = p_id AND user_id = auth.uid() AND kind = p_kind
      RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Composition introuvable'; END IF;
    DELETE FROM public.composition_items WHERE composition_id = v_id AND user_id = auth.uid();
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.composition_items (
      user_id, composition_id, position, course, notes,
      recipe_id, child_composition_id, quantity_factor
    ) VALUES (
      auth.uid(), v_id, v_position, nullif(trim(v_item->>'course'), ''),
      nullif(trim(v_item->>'notes'), ''),
      (v_item->>'recipe_id')::uuid, (v_item->>'child_composition_id')::uuid,
      coalesce((v_item->>'quantity_factor')::numeric, 1)
    );
    v_position := v_position + 1;
  END LOOP;
  RETURN v_id;
END;
$$;

-- Remplacement hebdomadaire atomique utilisé par l'outil de planification de Chef.
CREATE FUNCTION public.replace_week_meal_plan(p_week_start date, p_meals jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_meal jsonb;
DECLARE v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF p_meals IS NULL OR jsonb_typeof(p_meals) <> 'array' OR jsonb_array_length(p_meals) > 28 THEN
    RAISE EXCEPTION 'Planning invalide';
  END IF;
  DELETE FROM public.meal_plans WHERE user_id = auth.uid() AND week_start = p_week_start;
  FOR v_meal IN SELECT value FROM jsonb_array_elements(p_meals) LOOP
    INSERT INTO public.meal_plans (
      user_id, week_start, day_of_week, meal_type,
      recipe_id, composition_id, custom_meal, notes
    ) VALUES (
      auth.uid(), p_week_start, (v_meal->>'day_of_week')::integer,
      v_meal->>'meal_type', (v_meal->>'recipe_id')::uuid,
      (v_meal->>'composition_id')::uuid,
      nullif(trim(v_meal->>'custom_meal'), ''), nullif(trim(v_meal->>'notes'), '')
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Les appels de classement IA payants sont bornés avant tout appel fournisseur.
-- Quatre compteurs fixes par compte et globaux couvrent une minute et un jour.
CREATE TABLE public.pairing_ai_rate_limit_buckets (
  bucket_key text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('minute', 'day')),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (bucket_key, scope),
  CONSTRAINT pairing_ai_bucket_owner CHECK (
    (bucket_key = 'global' AND user_id IS NULL) OR
    (user_id IS NOT NULL AND bucket_key = 'user:' || user_id::text)
  )
);
ALTER TABLE public.pairing_ai_rate_limit_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pairing_ai_rate_limit_buckets FROM anon, authenticated;

CREATE FUNCTION public.consume_pairing_ai_quota(p_user_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_now timestamptz;
  v_user_key text;
  v_user_minute integer;
  v_global_minute integer;
  v_user_day integer;
  v_global_day integer;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Compte requis'; END IF;
  v_user_key := 'user:' || p_user_id::text;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('recipe-hug:pairing-ai', 0));
  v_now := pg_catalog.clock_timestamp();

  INSERT INTO public.pairing_ai_rate_limit_buckets (bucket_key, scope, user_id, window_started_at)
  VALUES (v_user_key, 'minute', p_user_id, v_now), ('global', 'minute', NULL, v_now),
    (v_user_key, 'day', p_user_id, v_now), ('global', 'day', NULL, v_now)
  ON CONFLICT (bucket_key, scope) DO NOTHING;

  UPDATE public.pairing_ai_rate_limit_buckets
  SET window_started_at = v_now, request_count = 0
  WHERE bucket_key IN (v_user_key, 'global') AND (
    (scope = 'minute' AND window_started_at <= v_now - interval '1 minute') OR
    (scope = 'day' AND window_started_at <= v_now - interval '1 day')
  );

  SELECT request_count INTO STRICT v_user_minute FROM public.pairing_ai_rate_limit_buckets
    WHERE bucket_key = v_user_key AND scope = 'minute';
  SELECT request_count INTO STRICT v_global_minute FROM public.pairing_ai_rate_limit_buckets
    WHERE bucket_key = 'global' AND scope = 'minute';
  SELECT request_count INTO STRICT v_user_day FROM public.pairing_ai_rate_limit_buckets
    WHERE bucket_key = v_user_key AND scope = 'day';
  SELECT request_count INTO STRICT v_global_day FROM public.pairing_ai_rate_limit_buckets
    WHERE bucket_key = 'global' AND scope = 'day';

  IF v_user_minute >= 4 OR v_global_minute >= 30 OR
     v_user_day >= 30 OR v_global_day >= 300 THEN
    RETURN false;
  END IF;

  UPDATE public.pairing_ai_rate_limit_buckets
  SET request_count = request_count + 1
  WHERE bucket_key IN (v_user_key, 'global') AND scope IN ('minute', 'day');
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_pairing_ai_quota(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_pairing_ai_quota(uuid) TO service_role;

ALTER TABLE public.recipe_pairing_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.composition_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pairing_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY recipe_pairing_profiles_owner ON public.recipe_pairing_profiles
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY compositions_owner ON public.compositions
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY composition_items_owner ON public.composition_items
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY pairing_feedback_owner ON public.pairing_feedback
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipe_pairing_profiles,
  public.compositions, public.composition_items, public.pairing_feedback TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_composition(text, text, integer, jsonb, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_week_meal_plan(date, jsonb) TO authenticated;
