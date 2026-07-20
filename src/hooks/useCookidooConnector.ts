import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

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

/**
 * Connecteur Cookidoo : gestion des identifiants chiffrés (côté serveur) de
 * l'utilisateur. L'export d'une recette vit désormais dans `useCookidooExport`
 * (flux asynchrone).
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

  return { status, saveCredentials, deleteCredentials };
}
