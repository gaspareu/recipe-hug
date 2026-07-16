import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';


export function useWebhookToken() {
  const { user } = useAuth();
  const [webhookToken, setWebhookToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const fetchToken = useCallback(async () => {
    if (!user) return;

    try {
      // Use secure RPC function instead of direct SELECT to avoid exposing token in general queries
      const { data, error } = await supabase.rpc('get_my_webhook_token');

      if (error) throw error;
      setWebhookToken(data || null);
    } catch (error) {
      console.error('Error fetching webhook token:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchToken();
    } else {
      // Sans utilisateur, il n'y a rien à charger : ne pas laisser isLoading
      // bloqué à true (état de chargement infini côté UI).
      setWebhookToken(null);
      setIsLoading(false);
    }
  }, [user, fetchToken]);

  const generateToken = async () => {
    if (!user) return;

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.rpc('generate_webhook_token', {
        user_uuid: user.id,
      });

      if (error) throw error;

      setWebhookToken(data);

      return data;
    } catch (error) {
      console.error('Error generating webhook token:', error);
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Copy failed:', error);
    }
  };

  return {
    webhookToken,
    isLoading,
    isGenerating,
    generateToken,
    copyToClipboard,
  };
}
