-- Fixtures jetables et tests transactionnels : aucune donnée conservée.
BEGIN;
INSERT INTO auth.users(id,email) VALUES ('00000000-0000-4000-8000-000000000011','cookidoo-a@example.invalid'),('00000000-0000-4000-8000-000000000012','cookidoo-b@example.invalid');
INSERT INTO public.recipes(id,user_id,title) VALUES ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000011','Test adaptation');
DO $$
DECLARE first jsonb; second jsonb; a uuid; j jsonb; retry jsonb; rev timestamptz;
BEGIN
  first := public.claim_cookidoo_adaptation('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000021','hash','v1');
  second := public.claim_cookidoo_adaptation('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000021','hash','v1');
  IF first->>'acquired' <> 'true' OR second->>'acquired' <> 'false' THEN RAISE EXCEPTION 'double adaptation'; END IF;
  IF first->'adaptation'->>'id' <> second->'adaptation'->>'id' THEN RAISE EXCEPTION 'cache duplicate'; END IF;
  a := (first->'adaptation'->>'id')::uuid;
  UPDATE public.recipe_cookidoo_adaptations SET status='ready', adapted_recipe='{}' WHERE id=a;
  second := public.claim_cookidoo_adaptation('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000021','hash','v1',true);
  IF second->>'acquired'<>'false' THEN RAISE EXCEPTION 'ready adaptation regenerated'; END IF;
  SELECT updated_at INTO rev FROM public.recipes WHERE id='00000000-0000-4000-8000-000000000021';
  j := public.begin_cookidoo_export('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000021',a,rev,'{}','{}');
  retry := public.begin_cookidoo_export('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000021',a,rev,'{}','{}');
  IF j->>'acquired'<>'true' OR retry->>'acquired'<>'false' OR j->'job'->>'id'<>retry->'job'->>'id' THEN RAISE EXCEPTION 'double export'; END IF;
  UPDATE public.cookidoo_exports SET status='unknown' WHERE id=(j->'job'->>'id')::uuid;
  retry := public.begin_cookidoo_export('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000021',a,rev,'{}','{}');
  IF retry->>'acquired'<>'false' THEN RAISE EXCEPTION 'unknown export replayed'; END IF;
  retry := public.begin_cookidoo_export('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000021',a,rev-interval '1 second','{}','{}');
  IF retry->>'error'<>'source_changed' THEN RAISE EXCEPTION 'stale source accepted'; END IF;
  UPDATE public.recipe_cookidoo_adaptations SET status='preparing',lease_until=now()-interval '1 minute' WHERE id=a;
  second := public.claim_cookidoo_adaptation('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000021','hash','v1');
  IF second->>'acquired'<>'true' OR first->'adaptation'->>'attempt_id'=second->'adaptation'->>'attempt_id' THEN RAISE EXCEPTION 'abandoned preparation not reclaimed'; END IF;
  UPDATE public.recipe_cookidoo_adaptations SET status='needs_input', request_context='{"technical_water_ml":500,"clarifications":["première précision"]}' WHERE id=a;
  second := public.claim_cookidoo_adaptation('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000021','hash','v1',true,'{"clarifications":["seconde précision"]}');
  IF second->'adaptation'->'request_context'->>'technical_water_ml'<>'500' OR jsonb_array_length(second->'adaptation'->'request_context'->'clarifications')<>2 THEN RAISE EXCEPTION 'clarifications lost'; END IF;
  IF has_function_privilege('authenticated','public.begin_cookidoo_export(uuid,uuid,uuid,timestamptz,jsonb,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'public reservation'; END IF;
  IF has_function_privilege('authenticated','public.claim_cookidoo_adaptation(uuid,uuid,text,text,boolean,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'public adaptation claim'; END IF;
  IF has_table_privilege('authenticated','public.recipe_cookidoo_adaptations','UPDATE') OR has_table_privilege('anon','public.recipe_cookidoo_adaptations','SELECT') THEN RAISE EXCEPTION 'client write privilege'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000012',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.recipe_cookidoo_adaptations) THEN RAISE EXCEPTION 'other owner can read copy'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000011',true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.recipe_cookidoo_adaptations)<>1 THEN RAISE EXCEPTION 'owner cannot read copy'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
