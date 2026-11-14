import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { parseRecipe } from '@/hooks/useRecipes';
import type { Composition } from '@/types/livre';

export function useCompositionRecipes(roots: string[], compositions: Composition[]) {
  const { user } = useAuth();
  const byId = new Map(compositions.map(composition => [composition.id, composition]));
  const recipeIds = new Set<string>();
  const visited = new Set<string>();

  const collect = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    for (const item of byId.get(id)?.items ?? []) {
      if (item.recipe_id) recipeIds.add(item.recipe_id);
      if (item.child_composition_id) collect(item.child_composition_id);
    }
  };
  roots.forEach(collect);
  const ids = [...recipeIds].sort();

  return useQuery({
    queryKey: ['recipes', 'composition', user?.id, ids],
    enabled: !!user && ids.length > 0,
    queryFn: async ({ signal }) => {
      if (!user) throw new Error('Non authentifié');
      const batches = [];
      for (let start = 0; start < ids.length; start += 100) {
        batches.push(supabase.from('recipes').select('*').eq('user_id', user.id).in('id', ids.slice(start, start + 100)).abortSignal(signal));
      }
      const responses = await Promise.all(batches);
      return responses.flatMap(({ data, error }) => {
        if (error) throw error;
        return data.map(parseRecipe);
      });
    },
  });
}
