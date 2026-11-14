import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
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

export function useCompositions(enabled = true, roots?: string[]) {
  const { user } = useAuth();
  const ids = roots && [...new Set(roots)].sort();

  return useQuery({
    queryKey: ['compositions', user?.id, ids],
    enabled: enabled && !!user && (ids === undefined || ids.length > 0),
    queryFn: async ({ signal }): Promise<Composition[]> => {
      if (!user) throw new Error('Non authentifié');
      const fetchCompositions = async (filter?: string[]) => {
        let query = supabase.from('compositions').select('*,composition_items!composition_items_parent_fkey(*)')
          .eq('user_id', user.id).order('updated_at', { ascending: false }).order('id');
        if (filter) query = query.in('id', filter);
        const { data, error } = await query.abortSignal(signal);
        if (error) throw error;
        return data.map(({ composition_items, ...row }) => parseComposition(row, composition_items as CompositionItem[]));
      };
      const compositions = await fetchCompositions(ids);
      if (!ids) return compositions;

      // Un menu peut contenir des plats. Les plats ne contiennent que des fiches.
      const known = new Set(ids);
      const childIds = new Set(compositions.flatMap(composition =>
        composition.items.flatMap(item => item.child_composition_id && !known.has(item.child_composition_id) ? [item.child_composition_id] : []),
      ));
      const children: Composition[] = [];
      const childList = [...childIds];
      for (let start = 0; start < childList.length; start += 100) {
        children.push(...await fetchCompositions(childList.slice(start, start + 100)));
      }
      return [...compositions, ...children];
    },
  });
}

export function useComposition(id: string) {
  const list = useCompositions(!!id, [id]);
  return { ...list, data: list.data?.find(item => item.id === id) ?? null, compositions: list.data };
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
