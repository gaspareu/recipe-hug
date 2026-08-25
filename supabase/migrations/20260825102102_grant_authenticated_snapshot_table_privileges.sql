-- Une reconstruction locale depuis les seules migrations doit disposer des mêmes
-- droits applicatifs que le projet hébergé. La RLS reste la couche d'autorisation
-- par ligne ; les tables sensibles conservent en plus des droits par colonne.
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE
  public.user_culinary_preferences,
  public.recipes,
  public.recipe_versions,
  public.meal_plans,
  public.ai_conversations
TO authenticated;

GRANT SELECT ON TABLE public.profiles_safe, public.user_ai_settings_safe TO authenticated;

-- Les partages sont consultables par leur expéditeur, mais créés uniquement par
-- l'edge function share-recipe avec le service role.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.recipe_shares FROM authenticated;
GRANT SELECT ON TABLE public.recipe_shares TO authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM authenticated;
GRANT SELECT (id, display_name, avatar_url, theme, created_at, updated_at),
  UPDATE (display_name, avatar_url, theme)
ON TABLE public.profiles
TO authenticated;

-- Les clés IA restent accessibles uniquement via manage-ai-keys (service role).
REVOKE ALL PRIVILEGES ON TABLE public.user_ai_settings FROM authenticated;
GRANT SELECT (id, user_id, provider, preferred_model, agent_configs, created_at, updated_at),
  INSERT (id, user_id, provider, preferred_model, agent_configs, created_at, updated_at)
ON TABLE public.user_ai_settings
TO authenticated;
