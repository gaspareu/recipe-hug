import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// Outil Thermomix supporté par l'export Cookidoo (scope réduit au TM7).
export type ThermomixTool = 'TM7';

export interface CookidooStatus {
  configured: boolean;
  email_masked?: string;
  country?: string;
  updated_at?: string;
}

export interface CookidooCredentialsInput {
  email: string;
  password: string;
  country?: string;
}

export interface CookidooExportResult {
  ok: boolean;
  cookidoo_recipe_id?: string;
  url?: string;
  tools?: ThermomixTool[];
  error?: string;
  message?: string;
  /** Avertissements non bloquants (ex. image absente ou non transférée). */
  warnings?: string[];
}

/**
 * Connecteur Cookidoo : gestion des identifiants chiffrés (côté serveur) et
 * export d'une recette vers le compte Cookidoo de l'utilisateur (Thermomix).
 */
export function useCookidooConnector() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const status = useQuery({
    queryKey: ['cookidoo-status', user?.id],
    queryFn: async (): Promise<CookidooStatus> => {
      const response = await supabase.functions.invoke('manage-cookidoo-credentials', {
        method: 'GET',
      });
      if (response.error) throw response.error;
      return (response.data as CookidooStatus) ?? { configured: false };
    },
    enabled: !!user?.id,
  });

  const saveCredentials = useMutation({
    mutationFn: async (input: CookidooCredentialsInput): Promise<CookidooStatus> => {
      const response = await supabase.functions.invoke('manage-cookidoo-credentials', {
        body: {
          email: input.email,
          password: input.password,
          country: input.country || 'fr',
        },
      });
      if (response.error) throw response.error;
      return response.data as CookidooStatus;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cookidoo-status', user?.id] });
    },
  });

  const deleteCredentials = useMutation({
    mutationFn: async (): Promise<void> => {
      const response = await supabase.functions.invoke('manage-cookidoo-credentials', {
        method: 'DELETE',
      });
      if (response.error) throw response.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cookidoo-status', user?.id] });
    },
  });

  const exportRecipe = useMutation({
    mutationFn: async (
      { recipeId, tools }: { recipeId: string; tools?: ThermomixTool[] },
    ): Promise<CookidooExportResult> => {
      const response = await supabase.functions.invoke('export-recipe-cookidoo', {
        body: { recipe_id: recipeId, tools: tools || ['TM7'] },
      });
      // L'edge function renvoie un corps JSON même en cas d'échec applicatif
      // (auth_failed / ip_blocked…). On le remonte tel quel quand il est présent.
      const data = response.data as CookidooExportResult | null;
      if (data) return data;
      if (response.error) throw response.error;
      return { ok: false, error: 'unknown', message: 'Réponse vide du serveur' };
    },
  });

  return { status, saveCredentials, deleteCredentials, exportRecipe };
}
