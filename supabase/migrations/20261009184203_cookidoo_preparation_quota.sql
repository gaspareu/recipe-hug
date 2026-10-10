-- Préparation Cookidoo : borne les appels IA facturés, même en concurrence.
CREATE TABLE public.cookidoo_preparation_rate_limit_buckets (
  bucket_key text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('minute', 'day')),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (bucket_key, scope),
  CONSTRAINT cookidoo_preparation_bucket_owner CHECK (
    (bucket_key = 'global' AND user_id IS NULL) OR
    (user_id IS NOT NULL AND bucket_key = 'user:' || user_id::text)
  )
);
ALTER TABLE public.cookidoo_preparation_rate_limit_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cookidoo_preparation_rate_limit_buckets FROM anon, authenticated;

CREATE FUNCTION public.consume_cookidoo_preparation_quota(p_user_id uuid) RETURNS boolean
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
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('recipe-hug:cookidoo-preparation', 0));
  v_now := pg_catalog.clock_timestamp();

  INSERT INTO public.cookidoo_preparation_rate_limit_buckets (bucket_key, scope, user_id, window_started_at)
  VALUES (v_user_key, 'minute', p_user_id, v_now), ('global', 'minute', NULL, v_now),
    (v_user_key, 'day', p_user_id, v_now), ('global', 'day', NULL, v_now)
  ON CONFLICT (bucket_key, scope) DO NOTHING;

  UPDATE public.cookidoo_preparation_rate_limit_buckets
  SET window_started_at = v_now, request_count = 0
  WHERE bucket_key IN (v_user_key, 'global') AND (
    (scope = 'minute' AND window_started_at <= v_now - interval '1 minute') OR
    (scope = 'day' AND window_started_at <= v_now - interval '1 day')
  );

  SELECT request_count INTO STRICT v_user_minute FROM public.cookidoo_preparation_rate_limit_buckets
    WHERE bucket_key = v_user_key AND scope = 'minute';
  SELECT request_count INTO STRICT v_global_minute FROM public.cookidoo_preparation_rate_limit_buckets
    WHERE bucket_key = 'global' AND scope = 'minute';
  SELECT request_count INTO STRICT v_user_day FROM public.cookidoo_preparation_rate_limit_buckets
    WHERE bucket_key = v_user_key AND scope = 'day';
  SELECT request_count INTO STRICT v_global_day FROM public.cookidoo_preparation_rate_limit_buckets
    WHERE bucket_key = 'global' AND scope = 'day';

  IF v_user_minute >= 2 OR v_global_minute >= 10 OR
     v_user_day >= 10 OR v_global_day >= 100 THEN
    RETURN false;
  END IF;

  UPDATE public.cookidoo_preparation_rate_limit_buckets
  SET request_count = request_count + 1
  WHERE bucket_key IN (v_user_key, 'global') AND scope IN ('minute', 'day');
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_cookidoo_preparation_quota(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_cookidoo_preparation_quota(uuid) TO service_role;

