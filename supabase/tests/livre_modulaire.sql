-- Exécution dans une base locale isolée après migration :
-- docker exec -i <conteneur_db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/livre_modulaire.sql
BEGIN;

INSERT INTO auth.users (id) VALUES
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002');

INSERT INTO public.recipes (id, user_id, title, entry_kind)
VALUES
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'Riz', 'preparation'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000002', 'Recette privée', 'preparation');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
SET CONSTRAINTS composition_items_recipe_fkey, meal_plans_recipe_owner_fkey IMMEDIATE;

DO $$
DECLARE v_dish uuid;
DECLARE v_menu uuid;
BEGIN
  IF (SELECT count(*) FROM public.recipes WHERE id IN (
    '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102')) <> 1 THEN
    RAISE EXCEPTION 'RLS recettes ne filtre pas les comptes';
  END IF;

  v_dish := public.save_composition('dish', 'Riz servi', 4, '["Dresser"]'::jsonb,
    '[{"recipe_id":"00000000-0000-0000-0000-000000000101","quantity_factor":1}]'::jsonb);
  v_menu := public.save_composition('menu', 'Dîner', 4, '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('child_composition_id', v_dish)));
  IF (SELECT count(*) FROM public.composition_items WHERE composition_id = v_menu) <> 1 THEN
    RAISE EXCEPTION 'Le menu ne référence pas son plat';
  END IF;

  BEGIN
    PERFORM public.save_composition('dish', 'Fuite', 4, '[]'::jsonb,
      '[{"recipe_id":"00000000-0000-0000-0000-000000000102"}]'::jsonb);
    RAISE EXCEPTION 'Référence entre comptes autorisée';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    PERFORM public.save_composition('dish', 'Imbrication interdite', 4, '[]'::jsonb,
      jsonb_build_array(jsonb_build_object('child_composition_id', v_dish)));
    RAISE EXCEPTION 'Plat enfant autorisé dans un plat';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Plat enfant autorisé dans un plat' THEN RAISE; END IF;
  END;

  BEGIN
    DELETE FROM public.recipes WHERE id = '00000000-0000-0000-0000-000000000101';
    RAISE EXCEPTION 'Suppression de fiche utilisée autorisée';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  INSERT INTO public.meal_plans (user_id, week_start, day_of_week, meal_type, composition_id)
  VALUES ('00000000-0000-0000-0000-000000000001', '2026-10-05', 0, 'dinner', v_menu);
  BEGIN
    PERFORM public.replace_week_meal_plan('2026-10-05',
      '[{"day_of_week":1,"meal_type":"dinner","recipe_id":"00000000-0000-0000-0000-000000000102"}]'::jsonb);
    RAISE EXCEPTION 'Planning inter-compte autorisé';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  IF (SELECT count(*) FROM public.meal_plans WHERE week_start = '2026-10-05' AND composition_id = v_menu) <> 1 THEN
    RAISE EXCEPTION 'Le planning initial a été perdu après un échec';
  END IF;
END $$;

RESET ROLE;
SET CONSTRAINTS ALL DEFERRED;
DO $$
DECLARE v_attempt integer;
BEGIN
  FOR v_attempt IN 1..4 LOOP
    IF NOT public.consume_pairing_ai_quota('00000000-0000-0000-0000-000000000001') THEN
      RAISE EXCEPTION 'Quota IA atteint trop tôt';
    END IF;
  END LOOP;
  IF public.consume_pairing_ai_quota('00000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'Quota IA utilisateur non appliqué';
  END IF;
END $$;

-- Les cascades du compte doivent effacer recettes, compositions, planning et quotas.
DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000001';
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.recipes WHERE user_id = '00000000-0000-0000-0000-000000000001') OR
     EXISTS (SELECT 1 FROM public.compositions WHERE user_id = '00000000-0000-0000-0000-000000000001') OR
     EXISTS (SELECT 1 FROM public.composition_items WHERE user_id = '00000000-0000-0000-0000-000000000001') OR
     EXISTS (SELECT 1 FROM public.meal_plans WHERE user_id = '00000000-0000-0000-0000-000000000001') OR
     EXISTS (SELECT 1 FROM public.pairing_ai_rate_limit_buckets WHERE user_id = '00000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'Données du compte conservées après suppression';
  END IF;
END $$;

ROLLBACK;
