import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PairingProfile } from '@/types/livre';

export interface PairingSuggestion { recipeId: string; score: number; reason: string }

export function usePairingProfile(recipeId: string) {
  return useQuery({
    queryKey: ['pairing-profile', recipeId], enabled: !!recipeId,
    queryFn: async () => {
      const { data, error } = await supabase.from('recipe_pairing_profiles')
        .select('*').eq('recipe_id', recipeId).maybeSingle();
      if (error) throw error;
      return data as PairingProfile | null;
    },
  });
}

export function useSavePairingProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (profile: Omit<PairingProfile, 'user_id' | 'updated_at'>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');
      const { error } = await supabase.from('recipe_pairing_profiles')
        .upsert({ ...profile, user_id: user.id }, { onConflict: 'recipe_id' });
      if (error) throw error;
    },
    onSuccess: (_, profile) => {
      queryClient.invalidateQueries({ queryKey: ['pairing-profile', profile.recipe_id] });
      queryClient.invalidateQueries({ queryKey: ['pairings'] });
    },
  });
}

export function usePairingRecommendations(recipeId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['pairings', recipeId], enabled: enabled && !!recipeId,
    queryFn: async (): Promise<PairingSuggestion[]> => {
      const { data, error } = await supabase.functions.invoke('recommend-pairings', {
        body: { recipe_id: recipeId },
      });
      if (error) throw error;
      if (!Array.isArray(data?.suggestions)) throw new Error('Réponse invalide');
      return data.suggestions.filter((item: unknown): item is PairingSuggestion => {
        if (!item || typeof item !== 'object') return false;
        const suggestion = item as Record<string, unknown>;
        return typeof suggestion.recipeId === 'string' && typeof suggestion.reason === 'string' && typeof suggestion.score === 'number';
      });
    },
    retry: 1,
    staleTime: 60_000,
  });
}

export function usePairingFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sourceRecipeId, candidateRecipeId, signal }: {
      sourceRecipeId: string; candidateRecipeId: string;
      signal: 'relevant' | 'not_for_me' | 'hidden';
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');
      const { data: existing, error: lookupError } = await supabase.from('pairing_feedback')
        .select('id').eq('source_recipe_id', sourceRecipeId).eq('candidate_recipe_id', candidateRecipeId).maybeSingle();
      if (lookupError) throw lookupError;
      const result = existing
        ? await supabase.from('pairing_feedback').update({ signal }).eq('id', existing.id)
        : await supabase.from('pairing_feedback').insert({ user_id: user.id, source_recipe_id: sourceRecipeId, candidate_recipe_id: candidateRecipeId, signal });
      if (result.error) throw result.error;
    },
    onSuccess: (_, input) => queryClient.invalidateQueries({ queryKey: ['pairings', input.sourceRecipeId] }),
  });
}
