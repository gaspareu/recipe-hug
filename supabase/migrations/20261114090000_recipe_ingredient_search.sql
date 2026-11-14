-- Champ calculé PostgREST pour rechercher les noms sans envoyer le JSON des ingrédients.
create function public.recipe_ingredient_names(recipe public.recipes)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(string_agg(ingredient ->> 'name', E'\n'), '')
  from pg_catalog.jsonb_array_elements(
    case when jsonb_typeof(recipe.ingredients) = 'array' then recipe.ingredients
      else '[]'::jsonb end
  ) as ingredient;
$$;

revoke execute on function public.recipe_ingredient_names(public.recipes) from public, anon;
grant execute on function public.recipe_ingredient_names(public.recipes) to authenticated;
