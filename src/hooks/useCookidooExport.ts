import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Intervalle d'interrogation de la ligne de journal, en millisecondes. */
const POLL_INTERVAL_MS = 2000;

/**
 * Au-delà de cette durée, on cesse d'attendre : un isolate tué avant la fin
 * laisse la ligne `pending` définitivement, et interroger sans fin ne
 * produirait qu'un spinner éternel.
 */
const POLL_TIMEOUT_MS = 120_000;

export type CookidooExportStatus = 'pending' | 'success' | 'failed';

export interface CookidooExportJob {
  id: string;
  status: CookidooExportStatus;
  cookidoo_recipe_id: string | null;
  cookidoo_url: string | null;
  updated: boolean;
  error_code: string | null;
  error_message: string | null;
  warnings: string[];
  unguided_steps: number[];
}

/** Réponse de la phase synchrone de l'edge function. */
export interface StartExportResponse {
  ok: boolean;
  export_id?: string;
  status?: 'pending';
  error?: string;
  message?: string;
}

/**
 * Export d'une recette vers Cookidoo.
 *
 * L'edge function rend la main immédiatement ; le résultat réel arrive par
 * interrogation de la ligne de journal. Le hook expose donc deux choses
 * distinctes : le déclenchement (`startExport`, qui peut échouer tout de suite
 * si la recette n'est pas exportable) et l'issue finale (`job`).
 */
export function useCookidooExport() {
  const [exportId, setExportId] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  const start = useMutation({
    mutationFn: async (recipeId: string): Promise<StartExportResponse> => {
      const response = await supabase.functions.invoke('export-recipe-cookidoo', {
        body: { recipe_id: recipeId, tools: ['TM7'] },
      });
      const data = response.data as StartExportResponse | null;
      if (data) return data;
      if (response.error) throw response.error;
      return { ok: false, error: 'unknown', message: 'Réponse vide du serveur' };
    },
  });

  const job = useQuery({
    queryKey: ['cookidoo-export', exportId],
    queryFn: async (): Promise<CookidooExportJob | null> => {
      const { data, error } = await supabase
        .from('cookidoo_exports')
        .select('id, status, cookidoo_recipe_id, cookidoo_url, updated, error_code, error_message, warnings, unguided_steps')
        .eq('id', exportId!)
        .maybeSingle();
      if (error) throw error;
      return (data as CookidooExportJob | null) ?? null;
    },
    enabled: !!exportId && !timedOut,
    // Simple fonction de cadence : on ré-interroge tant que le statut n'est pas
    // final. La borne de temps est armée séparément (effet ci-dessous), pour ne
    // pas mêler une décision de cadence à une mutation d'état.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && status !== 'pending' ? false : POLL_INTERVAL_MS;
    },
  });

  // Borne l'attente : un isolate tué avant la fin laisse la ligne `pending`
  // définitivement, et interroger sans fin ne produirait qu'un spinner éternel.
  // Le minuteur est réarmé à chaque nouvel export et nettoyé au démontage.
  useEffect(() => {
    if (!exportId) return;
    const timer = setTimeout(() => setTimedOut(true), POLL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [exportId]);

  /** Lance l'export. Renvoie la réponse synchrone : un `ok: false` est définitif. */
  const startExport = async (recipeId: string): Promise<StartExportResponse> => {
    setExportId(null);
    setTimedOut(false);
    const response = await start.mutateAsync(recipeId);
    if (response.ok && response.export_id) setExportId(response.export_id);
    return response;
  };

  /** Remet le hook à zéro (fermeture du dialogue, nouvel export). */
  const reset = () => {
    setExportId(null);
    setTimedOut(false);
  };

  return {
    startExport,
    reset,
    exportId,
    isStarting: start.isPending,
    job: job.data ?? null,
    timedOut,
  };
}
