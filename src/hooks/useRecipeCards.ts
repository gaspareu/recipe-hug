import { useDeferredValue } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { RecipeStatus } from '@/types/recipe';

interface RecipeCardFilters {
  search: string;
  entryKind?: 'preparation' | 'complete_dish' | null;
  status?: RecipeStatus;
  season?: string;
  favoritesOnly?: boolean;
  sort?: 'recent' | 'alpha' | 'favorites';
  titleOnly?: boolean;
}

const PAGE_SIZE = 24;

export function useRecipeCards(filters: RecipeCardFilters, enabled = true) {
  const { user } = useAuth();
  const search = useDeferredValue(filters.search.trim());
  const criteria = { ...filters, search };

  const result = useInfiniteQuery({
    queryKey: ['recipes', 'cards', user?.id, criteria],
    enabled: enabled && !!user,
    initialPageParam: 0,
    staleTime: 30_000,
    queryFn: async ({ pageParam, signal }) => {
      if (!user) throw new Error('Non authentifié');
      let query = supabase.from('recipes').select('id,title,source_image_url,is_favorite').eq('user_id', user.id);
      if (criteria.entryKind === null) query = query.is('entry_kind', null);
      else if (criteria.entryKind) query = query.eq('entry_kind', criteria.entryKind);
      if (criteria.status) query = query.eq('status', criteria.status);
      if (criteria.season) query = query.in('season', [criteria.season, 'toutes saisons']);
      if (criteria.favoritesOnly) query = query.eq('is_favorite', true);

      if (search) {
        // Construire le littéral PostgREST et son motif PostgreSQL en un passage.
        const encoded = search.replace(/[.*+?^${}()|[\]\\"]/g, character => {
          if (character === '\\') return '\\\\\\\\';
          if (character === '"') return '\\"';
          return '\\\\' + character;
        });
        const quoted = '"' + encoded + '"';
        const columns = criteria.titleOnly ? ['title'] : ['title', 'ai_summary', 'recipe_ingredient_names'];
        query = query.or(columns.map(column => `${column}.imatch.${quoted}`).join(','));
      }
      if (criteria.sort === 'alpha') query = query.order('title');
      if (criteria.sort === 'favorites') query = query.order('is_favorite', { ascending: false, nullsFirst: false });
      if (criteria.sort !== 'alpha') query = query.order('updated_at', { ascending: false, nullsFirst: false });

      const { data, error } = await query.order('id').range(pageParam, pageParam + PAGE_SIZE).abortSignal(signal);
      if (error) throw error;
      return { rows: data.slice(0, PAGE_SIZE), next: data.length > PAGE_SIZE ? pageParam + PAGE_SIZE : undefined };
    },
    getNextPageParam: page => page.next,
  });

  return { ...result, isSearchPending: search !== filters.search.trim() };
}
