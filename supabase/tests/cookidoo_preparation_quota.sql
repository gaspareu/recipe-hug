-- À exécuter sur la base de développement après migration. Aucune donnée conservée.
BEGIN;
INSERT INTO auth.users(id) VALUES ('00000000-0000-0000-0000-000000000901');
DELETE FROM public.cookidoo_preparation_rate_limit_buckets;
DO $$
DECLARE v_user uuid := '00000000-0000-0000-0000-000000000901';
BEGIN
  IF has_function_privilege('authenticated', 'public.consume_cookidoo_preparation_quota(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.consume_cookidoo_preparation_quota(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'RPC accessible au client';
  END IF;
  IF has_table_privilege('authenticated', 'public.cookidoo_preparation_rate_limit_buckets', 'SELECT') THEN
    RAISE EXCEPTION 'Compteurs accessibles au client';
  END IF;
  IF NOT public.consume_cookidoo_preparation_quota(v_user) OR NOT public.consume_cookidoo_preparation_quota(v_user) THEN
    RAISE EXCEPTION 'Quota initial refusé';
  END IF;
  IF public.consume_cookidoo_preparation_quota(v_user) THEN RAISE EXCEPTION 'Quota minute dépassé'; END IF;
  UPDATE public.cookidoo_preparation_rate_limit_buckets SET window_started_at = now() - interval '2 minutes' WHERE scope = 'minute';
  IF NOT public.consume_cookidoo_preparation_quota(v_user) THEN RAISE EXCEPTION 'Quota minute non réarmé'; END IF;
  UPDATE public.cookidoo_preparation_rate_limit_buckets SET request_count = 10 WHERE bucket_key = 'global' AND scope = 'minute';
  IF public.consume_cookidoo_preparation_quota(v_user) THEN RAISE EXCEPTION 'Plafond global minute dépassé'; END IF;
  UPDATE public.cookidoo_preparation_rate_limit_buckets SET request_count = 0 WHERE scope = 'minute';
  UPDATE public.cookidoo_preparation_rate_limit_buckets SET request_count = 10 WHERE bucket_key <> 'global' AND scope = 'day';
  IF public.consume_cookidoo_preparation_quota(v_user) THEN RAISE EXCEPTION 'Quota quotidien dépassé'; END IF;
  UPDATE public.cookidoo_preparation_rate_limit_buckets SET request_count = 0 WHERE bucket_key <> 'global' AND scope = 'day';
  UPDATE public.cookidoo_preparation_rate_limit_buckets SET request_count = 100 WHERE bucket_key = 'global' AND scope = 'day';
  IF public.consume_cookidoo_preparation_quota(v_user) THEN RAISE EXCEPTION 'Plafond global quotidien dépassé'; END IF;
  UPDATE public.cookidoo_preparation_rate_limit_buckets SET window_started_at = now() - interval '2 days';
  IF NOT public.consume_cookidoo_preparation_quota(v_user) THEN RAISE EXCEPTION 'Quota quotidien non réarmé'; END IF;
END $$;
ROLLBACK;
