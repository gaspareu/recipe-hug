import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

/**
 * Token webhook personnel de l'utilisateur, géré via TanStack Query :
 * - lecture par la RPC sécurisée `get_my_webhook_token` (jamais un `SELECT`
 *   direct qui exposerait le token dans des requêtes générales) ;
 * - (re)génération via `generate_webhook_token`, le cache étant mis à jour à
 *   la volée.
 */
export function useWebhookToken() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;
  const tokenQueryKey = ['webhook_token', userId] as const;

  const { data: webhookToken = null, isLoading } = useQuery({
    queryKey: tokenQueryKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_webhook_token');
      if (error) throw error;
      return data ?? null;
    },
    enabled: !!userId,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('Utilisateur non authentifié');
      const { data, error } = await supabase.rpc('generate_webhook_token', {
        user_uuid: userId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (token) => {
      queryClient.setQueryData(tokenQueryKey, token);
    },
  });

  const generateToken = useCallback(async (): Promise<string | null> => {
    if (!userId) return null;
    try {
      return await generateMutation.mutateAsync();
    } catch (error) {
      console.error('Error generating webhook token:', error);
      return null;
    }
  }, [userId, generateMutation]);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Copy failed:', error);
    }
  }, []);

  return {
    webhookToken,
    isLoading,
    isGenerating: generateMutation.isPending,
    generateToken,
    copyToClipboard,
  };
}
