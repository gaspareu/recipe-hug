-- Quotas atomiques pour protéger la clé ElevenLabs partagée contre les abus.
-- Les compteurs ne sont jamais exposés directement : seule la fonction
-- SECURITY DEFINER ci-dessous est appelable uniquement par le service_role.
CREATE TABLE public.voice_rate_limit_buckets (
  bucket_key text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('tts', 'scribe')),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  cost_count integer NOT NULL DEFAULT 0 CHECK (cost_count >= 0),
  PRIMARY KEY (bucket_key, scope)
);

ALTER TABLE public.voice_rate_limit_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.voice_rate_limit_buckets FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_voice_quota(
  p_user_id uuid,
  p_scope text,
  p_cost integer DEFAULT 1
)
RETURNS TABLE(allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_user_key text;
  v_user_request_limit integer;
  v_user_cost_limit integer;
  v_global_request_limit integer;
  v_global_cost_limit integer;
  v_effective_cost integer;
  v_user_bucket public.voice_rate_limit_buckets%ROWTYPE;
  v_global_bucket public.voice_rate_limit_buckets%ROWTYPE;
  v_user_exceeded boolean;
  v_global_exceeded boolean;
  v_retry_after integer := 1;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required' USING ERRCODE = '22023';
  END IF;

  IF p_scope = 'tts' THEN
    IF p_cost IS NULL OR p_cost < 1 OR p_cost > 5000 THEN
      RAISE EXCEPTION 'Invalid TTS cost' USING ERRCODE = '22023';
    END IF;
    v_effective_cost := p_cost;
    v_user_request_limit := 12;
    v_user_cost_limit := 12000;
    v_global_request_limit := 240;
    v_global_cost_limit := 240000;
  ELSIF p_scope = 'scribe' THEN
    v_effective_cost := 1;
    v_user_request_limit := 8;
    v_user_cost_limit := 8;
    v_global_request_limit := 160;
    v_global_cost_limit := 160;
  ELSE
    RAISE EXCEPTION 'Invalid voice quota scope' USING ERRCODE = '22023';
  END IF;

  v_user_key := 'user:' || p_user_id::text;

  -- Un verrou par service sérialise le contrôle des buckets utilisateur et
  -- global afin qu'aucune requête concurrente ne puisse dépasser les plafonds.
  PERFORM pg_advisory_xact_lock(hashtextextended('recipe-hug:voice:' || p_scope, 0));

  INSERT INTO public.voice_rate_limit_buckets (bucket_key, scope, window_started_at)
  VALUES
    (v_user_key, p_scope, v_now),
    ('global', p_scope, v_now)
  ON CONFLICT (bucket_key, scope) DO NOTHING;

  UPDATE public.voice_rate_limit_buckets
  SET window_started_at = v_now,
      request_count = 0,
      cost_count = 0
  WHERE scope = p_scope
    AND bucket_key IN (v_user_key, 'global')
    AND window_started_at <= v_now - interval '1 minute';

  SELECT * INTO STRICT v_user_bucket
  FROM public.voice_rate_limit_buckets
  WHERE bucket_key = v_user_key AND scope = p_scope;

  SELECT * INTO STRICT v_global_bucket
  FROM public.voice_rate_limit_buckets
  WHERE bucket_key = 'global' AND scope = p_scope;

  v_user_exceeded :=
    v_user_bucket.request_count + 1 > v_user_request_limit OR
    v_user_bucket.cost_count + v_effective_cost > v_user_cost_limit;
  v_global_exceeded :=
    v_global_bucket.request_count + 1 > v_global_request_limit OR
    v_global_bucket.cost_count + v_effective_cost > v_global_cost_limit;

  IF NOT v_user_exceeded AND NOT v_global_exceeded THEN
    UPDATE public.voice_rate_limit_buckets
    SET request_count = request_count + 1,
        cost_count = cost_count + v_effective_cost
    WHERE scope = p_scope AND bucket_key IN (v_user_key, 'global');

    RETURN QUERY SELECT true, 0;
    RETURN;
  END IF;

  IF v_user_exceeded THEN
    v_retry_after := GREATEST(
      v_retry_after,
      CEIL(EXTRACT(EPOCH FROM (v_user_bucket.window_started_at + interval '1 minute' - v_now)))::integer
    );
  END IF;
  IF v_global_exceeded THEN
    v_retry_after := GREATEST(
      v_retry_after,
      CEIL(EXTRACT(EPOCH FROM (v_global_bucket.window_started_at + interval '1 minute' - v_now)))::integer
    );
  END IF;

  RETURN QUERY SELECT false, v_retry_after;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_voice_quota(uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_voice_quota(uuid, text, integer) TO service_role;

COMMENT ON TABLE public.voice_rate_limit_buckets IS
  'Compteurs internes par minute pour les appels ElevenLabs; accès direct interdit.';
COMMENT ON FUNCTION public.consume_voice_quota(uuid, text, integer) IS
  'Consomme atomiquement les quotas vocal utilisateur et global; fail-closed côté Edge Function.';
