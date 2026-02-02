import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export function useWebhookToken() {
  const { user } = useAuth();
  const [webhookToken, setWebhookToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (user) {
      fetchToken();
    }
  }, [user]);

  const fetchToken = async () => {
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
  };

  const generateToken = async () => {
    if (!user) return;

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.rpc('generate_webhook_token', {
        user_uuid: user.id,
      });

      if (error) throw error;

      setWebhookToken(data);
      toast.success('Token généré', {
        description: 'Votre nouveau token webhook est prêt',
      });

      return data;
    } catch (error) {
      console.error('Error generating webhook token:', error);
      toast.error('Erreur', {
        description: 'Impossible de générer le token',
      });
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copié !', {
        description: 'Token copié dans le presse-papiers',
      });
    } catch (error) {
      toast.error('Erreur', {
        description: 'Impossible de copier',
      });
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
