import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Step, Ingredient } from '@/types/recipe';

export interface CookidooAdaptation {
  id: string;
  status: 'preparing' | 'ready' | 'needs_input' | 'failed';
  recipe: { title: string; servings?: number | null; ingredients: Ingredient[]; steps: Step[] } | null;
  ingredients: string[];
  guided_steps: number;
  changes: string[];
  notes: string[];
  blockers: string[];
  error_code: string | null;
  reused: boolean;
  retry_at?: string | null;
  started_at?: string;
  request_context?: { technical_water_ml?: number; clarifications?: string[] };
  confirmation: { token: string; expires_at: number } | null;
}
export interface CookidooExportJob {
  id: string;
  status: 'pending' | 'success' | 'failed' | 'unknown';
  phase: string;
  adaptation_id?: string | null;
  cookidoo_recipe_id: string | null;
  cookidoo_url: string | null;
  updated: boolean;
  error_code: string | null;
  warnings: string[];
  unguided_steps: number[];
}
interface CookidooState {
  ok: boolean;
  adaptation: CookidooAdaptation | null;
  job: CookidooExportJob | null;
  has_destination: boolean;
}
interface OperationResponse { ok: boolean; error?: string; export_id?: string }
export class CookidooError extends Error {
  constructor(public readonly code: string) { super(code); }
}
/** Tous les accès passent par l'API : reprise depuis la base, sans copie locale périssable. */
export function useCookidooExport(recipeId: string, enabled = true) {
  const { user } = useAuth();
  const cache = useQueryClient();
  const key = ['cookidoo-recipe', user?.id, recipeId];
  const capability = useQuery({
    queryKey: ['cookidoo-capability', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('export-recipe-cookidoo', { method: 'GET' });
      return !error && Array.isArray(data?.capabilities) && data.capabilities.includes('cookidoo_adaptation_v2');
    },
    enabled: enabled && !!user,
    staleTime: 30_000,
    retry: false,
  });
  async function request<T extends OperationResponse>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.functions.invoke('export-recipe-cookidoo', { body: { recipe_id: recipeId, ...body } });
    if (error || !data) throw new CookidooError('connection_unknown');
    if (!data.ok) throw new CookidooError(data.error ?? 'service_unavailable');
    return data as T;
  }
  const state = useQuery({
    queryKey: key,
    queryFn: () => request<CookidooState>({ action: 'status' }),
    enabled: enabled && !!user && capability.data === true,
    refetchInterval: query => query.state.data?.adaptation?.status === 'preparing' || query.state.data?.job?.status === 'pending' ? 2000 : false,
    staleTime: 0,
    retry: false,
  });
  const prepare = useMutation({
    mutationFn: async (input: { technical_water_ml?: number; clarifications?: string } = {}) => {
      if (capability.data !== true) throw new CookidooError('backend_updating');
      return request<CookidooState>({ action: 'prepare', ...input });
    },
    onSuccess: value => cache.setQueryData(key, value),
    onSettled: () => cache.invalidateQueries({ queryKey: key }),
  });
  const send = useMutation({
    mutationFn: async (options: { replace_remote?: boolean; recreate_remote?: boolean } = {}) => {
      const adaptation = state.data?.adaptation;
      if (!adaptation?.confirmation) throw new CookidooError('preparation_required');
      return request<OperationResponse>({ action: 'send', adaptation_id: adaptation.id, confirmation: adaptation.confirmation, ...options });
    },
    onSettled: () => cache.invalidateQueries({ queryKey: key }),
  });
  const check = useMutation({
    mutationFn: () => request<OperationResponse>({ action: 'check' }),
    onSettled: () => cache.invalidateQueries({ queryKey: key }),
  });
  const acknowledgeAbsent = useMutation({
    mutationFn: () => request<OperationResponse>({ action: 'acknowledge_absent', confirmed_absent: true }),
    onSettled: () => cache.invalidateQueries({ queryKey: key }),
  });
  return {
    adaptation: state.data?.adaptation ?? null,
    job: state.data?.job ?? null,
    hasDestination: state.data?.has_destination ?? false,
    prepare, send, check, acknowledgeAbsent,
    refresh: state.refetch,
    isRefreshing: state.isFetching,
    isLoading: capability.isLoading || (capability.data === true && state.isLoading),
    unavailable: capability.isError || capability.data === false,
    error: state.error,
  };
}
