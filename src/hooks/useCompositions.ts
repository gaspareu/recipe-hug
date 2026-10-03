import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { Composition, CompositionDraft, CompositionItem } from '@/types/livre';

function parseComposition(row: Record<string, unknown>, items: CompositionItem[]): Composition {
  return {
    ...row,
    assembly_steps: Array.isArray(row.assembly_steps)
      ? row.assembly_steps.filter((step): step is string => typeof step === 'string')
      : [],
    items: items.sort((a, b) => a.position - b.position),
  } as Composition;
}

export function useCompositions() {
  return useQuery({
    queryKey: ['compositions'],
    queryFn: async (): Promise<Composition[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');
      const { data: rows, error } = await supabase.from('compositions')
        .select('*').order('updated_at', { ascending: false });
      if (error) throw error;
      if (!rows?.length) return [];
      const { data: items, error: itemsError } = await supabase.from('composition_items')
        .select('*').in('composition_id', rows.map(row => row.id));
      if (itemsError) throw itemsError;
      return rows.map(row => parseComposition(row, (items ?? []).filter(item => item.composition_id === row.id) as CompositionItem[]));
    },
  });
}

export function useComposition(id: string) {
  const list = useCompositions();
  return { ...list, data: list.data?.find(item => item.id === id) ?? null };
}

export function useSaveComposition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (draft: CompositionDraft) => {
      const { data, error } = await supabase.rpc('save_composition', {
        ...(draft.id ? { p_id: draft.id } : {}),
        p_kind: draft.kind,
        p_title: draft.title.trim(),
        p_servings: draft.servings,
        p_assembly_steps: draft.assembly_steps as Json,
        p_items: draft.items as unknown as Json,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compositions'] });
      queryClient.invalidateQueries({ queryKey: ['meal_plans'] });
    },
  });
}

export function useDeleteComposition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('compositions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['compositions'] }),
  });
}
