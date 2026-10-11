ALTER TABLE public.recipe_cookidoo_adaptations ADD COLUMN request_context jsonb NOT NULL DEFAULT '{}';
DROP FUNCTION public.claim_cookidoo_adaptation(uuid,uuid,text,text,boolean);
CREATE FUNCTION public.claim_cookidoo_adaptation(p_user_id uuid, p_recipe_id uuid, p_fingerprint text, p_version text, p_retry boolean DEFAULT false, p_context jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public.recipe_cookidoo_adaptations; acquired boolean := false;
BEGIN
  PERFORM 1 FROM public.recipes WHERE id = p_recipe_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recipe_not_found'; END IF;
  SELECT * INTO a FROM public.recipe_cookidoo_adaptations WHERE user_id=p_user_id AND recipe_id=p_recipe_id AND source_fingerprint=p_fingerprint AND adapter_version=p_version FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.recipe_cookidoo_adaptations(user_id,recipe_id,source_fingerprint,adapter_version,request_context)
      VALUES(p_user_id,p_recipe_id,p_fingerprint,p_version,p_context) RETURNING * INTO a;
    acquired := true;
  ELSIF (a.status='preparing' AND a.lease_until < now()) OR a.status='failed' OR (p_retry AND a.status='needs_input') THEN
    UPDATE public.recipe_cookidoo_adaptations SET status='preparing', attempt_id=gen_random_uuid(), lease_until=now()+interval '2 minutes', error_code=null, request_context=jsonb_set(a.request_context || p_context, '{clarifications}', coalesce(a.request_context->'clarifications','[]'::jsonb) || coalesce(p_context->'clarifications','[]'::jsonb)), updated_at=now()
      WHERE id=a.id RETURNING * INTO a;
    acquired := true;
  END IF;
  RETURN jsonb_build_object('adaptation',to_jsonb(a),'acquired',acquired);
END $$;
REVOKE ALL ON FUNCTION public.claim_cookidoo_adaptation(uuid,uuid,text,text,boolean,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_cookidoo_adaptation(uuid,uuid,text,text,boolean,jsonb) TO service_role;
