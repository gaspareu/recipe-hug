import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type AIProvider = 'lovable' | 'gemini' | 'openai' | 'anthropic';

export interface AISettings {
  id: string;
  user_id: string;
  provider: AIProvider;
  api_key: string | null;
  preferred_model: string | null;
  created_at: string;
  updated_at: string;
}

export interface AISettingsInput {
  provider: AIProvider;
  api_key?: string | null;
  preferred_model?: string | null;
}

// Models available per provider
export const PROVIDER_MODELS: Record<AIProvider, { value: string; label: string }[]> = {
  lovable: [
    { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash (défaut)' },
    { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini' },
  ],
  gemini: [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  ],
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  ],
  anthropic: [
    { value: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet' },
    { value: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku' },
    { value: 'claude-3-opus-latest', label: 'Claude 3 Opus' },
  ],
};

export const PROVIDER_INFO: Record<AIProvider, { name: string; description: string }> = {
  lovable: {
    name: 'Lovable AI',
    description: 'Inclus dans votre abonnement, aucune configuration requise',
  },
  gemini: {
    name: 'Google Gemini',
    description: 'API Google AI Studio',
  },
  openai: {
    name: 'OpenAI',
    description: 'API OpenAI (GPT-4)',
  },
  anthropic: {
    name: 'Anthropic',
    description: 'API Claude',
  },
};

export function useAISettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['ai-settings', user?.id],
    queryFn: async (): Promise<AISettings | null> => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('user_ai_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return data as AISettings | null;
    },
    enabled: !!user?.id,
  });

  const updateSettings = useMutation({
    mutationFn: async (input: AISettingsInput) => {
      if (!user?.id) throw new Error('User not authenticated');

      const payload = {
        user_id: user.id,
        provider: input.provider,
        api_key: input.api_key || null,
        preferred_model: input.preferred_model || null,
      };

      // Upsert - insert or update
      const { data, error } = await supabase
        .from('user_ai_settings')
        .upsert(payload, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) throw error;
      return data as AISettings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-settings', user?.id] });
      toast.success('Configuration IA sauvegardée');
    },
    onError: (error) => {
      console.error('Error saving AI settings:', error);
      toast.error('Erreur lors de la sauvegarde');
    },
  });

  const validateApiKey = useMutation({
    mutationFn: async ({ provider, apiKey }: { provider: AIProvider; apiKey: string }) => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await supabase.functions.invoke('validate-ai-key', {
        body: { provider, api_key: apiKey },
      });

      if (response.error) throw response.error;
      return response.data as { valid: boolean; error?: string };
    },
  });

  return {
    settings,
    isLoading,
    error,
    updateSettings,
    validateApiKey,
    // Helper to get effective provider (default to lovable)
    effectiveProvider: (settings?.provider || 'lovable') as AIProvider,
    effectiveModel: settings?.preferred_model || PROVIDER_MODELS[settings?.provider || 'lovable'][0]?.value,
  };
}
