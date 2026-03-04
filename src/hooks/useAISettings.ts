import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';

export type AIProvider = 'lovable' | 'gemini' | 'openai' | 'anthropic';

// Agent types for per-function AI configuration
export type AgentType = 
  | 'chat'           // home-assistant - Main orchestration
  | 'create_recipe'  // generate-recipe - Recipe creation
  | 'cooking'        // cooking-assistant - Step-by-step guidance
  | 'edit_recipe'    // cooking-assistant (edit mode)
  | 'generate_image' // generate-recipe-image - Image generation
  | 'parse_image'    // parse-recipe-image - Image analysis
  | 'webhook';       // webhook-recipe - External import

// Per-agent configuration
export interface AgentConfig {
  provider: AIProvider;
  model: string;
}

// API keys per provider
export type ProviderApiKeys = Partial<Record<Exclude<AIProvider, 'lovable'>, string>>;

// Masked key info returned from server
export interface MaskedKeyInfo {
  has_key: boolean;
  masked: string | null;
}

// Full AI settings including per-agent configs
export interface AISettings {
  id: string;
  user_id: string;
  provider: AIProvider;
  api_key: string | null; // Deprecated - kept for backwards compatibility
  preferred_model: string | null;
  agent_configs: Partial<Record<AgentType, AgentConfig>> | null;
  provider_api_keys: ProviderApiKeys; // Contains encrypted blobs from DB (used for presence check only)
  created_at: string;
  updated_at: string;
}

export interface AISettingsInput {
  provider: AIProvider;
  api_key?: string | null;
  preferred_model?: string | null;
  agent_configs?: Partial<Record<AgentType, AgentConfig>> | null;
  provider_api_keys?: ProviderApiKeys; // Raw plaintext keys to be encrypted server-side
}

// Model capabilities for filtering
export type ModelCapability = 'text' | 'streaming' | 'vision' | 'tools' | 'image_generation';

export interface ModelInfo {
  value: string;
  label: string;
  capabilities: ModelCapability[];
}

// Models available per provider with capabilities
export const PROVIDER_MODELS: Record<AIProvider, ModelInfo[]> = {
  lovable: [
    { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash (défaut)', capabilities: ['text', 'streaming', 'vision', 'tools'] },
    { value: 'google/gemini-3-pro-preview', label: 'Gemini 3 Pro', capabilities: ['text', 'streaming', 'vision', 'tools'] },
    { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', capabilities: ['text', 'streaming', 'vision', 'tools'] },
    { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', capabilities: ['text', 'streaming', 'vision', 'tools'] },
    { value: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', capabilities: ['text', 'streaming'] },
    { value: 'google/gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image', capabilities: ['image_generation'] },
    { value: 'google/gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image', capabilities: ['image_generation'] },
    { value: 'openai/gpt-5', label: 'GPT-5', capabilities: ['text', 'streaming', 'vision', 'tools'] },
    { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini', capabilities: ['text', 'streaming', 'vision', 'tools'] },
    { value: 'openai/gpt-5-nano', label: 'GPT-5 Nano', capabilities: ['text', 'streaming'] },
    { value: 'openai/gpt-5.2', label: 'GPT-5.2', capabilities: ['text', 'streaming', 'vision', 'tools'] },
  ],
  gemini: [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', capabilities: ['text', 'streaming', 'vision', 'tools'] },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', capabilities: ['text', 'streaming', 'vision', 'tools'] },
    { value: 'gemini-2.5-flash-lite-preview-06-17', label: 'Gemini 2.5 Flash Lite', capabilities: ['text', 'streaming'] },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', capabilities: ['text', 'streaming', 'tools'] },
    { value: 'gemini-2.0-flash-exp-image-generation', label: 'Gemini 2.0 Flash Image', capabilities: ['image_generation'] },
  ],
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o', capabilities: ['text', 'streaming', 'vision', 'tools'] },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini', capabilities: ['text', 'streaming', 'vision', 'tools'] },
    { value: 'o3-mini', label: 'o3-mini', capabilities: ['text', 'streaming', 'tools'] },
  ],
  anthropic: [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', capabilities: ['text', 'streaming', 'vision', 'tools'] },
    { value: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet', capabilities: ['text', 'streaming', 'vision', 'tools'] },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', capabilities: ['text', 'streaming', 'tools'] },
  ],
};

// Required capabilities per agent type
export const AGENT_REQUIRED_CAPABILITIES: Record<AgentType, ModelCapability[]> = {
  chat: ['text', 'streaming', 'tools'],
  create_recipe: ['text', 'streaming', 'tools'],
  cooking: ['text', 'streaming', 'tools'],
  edit_recipe: ['text', 'streaming', 'tools'],
  generate_image: ['image_generation'],
  parse_image: ['vision'],
  timeline: ['text', 'tools'],
  webhook: ['text'],
};

// Agent display info with labels
export const AGENT_LABELS: Record<AgentType, { name: string; icon: string; description: string }> = {
  chat: { name: 'Chat principal', icon: '💬', description: 'Orchestration et conversation' },
  create_recipe: { name: 'Création de recettes', icon: '🍳', description: 'Génération de nouvelles recettes' },
  cooking: { name: 'Assistant cuisine', icon: '👨‍🍳', description: 'Guidage étape par étape' },
  edit_recipe: { name: 'Modification', icon: '✏️', description: 'Adaptation et variantes' },
  generate_image: { name: 'Génération d\'images', icon: '📸', description: 'Photos de plats' },
  parse_image: { name: 'Analyse d\'images', icon: '🔍', description: 'Extraction depuis photos' },
  timeline: { name: 'Analyse timeline', icon: '📊', description: 'Diagramme de Gantt' },
  webhook: { name: 'Import webhook', icon: '🔗', description: 'Import externe' },
};

// Flat model type for compatible models list
export interface FlatModelInfo extends ModelInfo {
  provider: AIProvider;
}

// Helper to get compatible models for an agent (flat list)
export function getCompatibleModels(agentType: AgentType): FlatModelInfo[] {
  const requiredCapabilities = AGENT_REQUIRED_CAPABILITIES[agentType];
  
  const result: FlatModelInfo[] = [];
  
  for (const [provider, models] of Object.entries(PROVIDER_MODELS) as [AIProvider, ModelInfo[]][]) {
    for (const model of models) {
      if (requiredCapabilities.every(cap => model.capabilities.includes(cap))) {
        result.push({ ...model, provider });
      }
    }
  }
  
  return result;
}

export const PROVIDER_INFO: Record<AIProvider, { name: string; description: string; keyUrl?: string }> = {
  lovable: {
    name: 'Lovable AI',
    description: 'Inclus dans votre abonnement, aucune configuration requise',
  },
  gemini: {
    name: 'Google Gemini',
    description: 'API Google AI Studio',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  openai: {
    name: 'OpenAI',
    description: 'API OpenAI (GPT-4o, o3)',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    name: 'Anthropic',
    description: 'API Claude',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
};

export function useAISettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['ai-settings', user?.id],
    queryFn: async (): Promise<AISettings | null> => {
      if (!user?.id) return null;

      // Only select non-sensitive columns — never fetch api_key or provider_api_keys to the client
      const { data, error } = await supabase
        .from('user_ai_settings')
        .select('id, user_id, provider, preferred_model, agent_configs, created_at, updated_at')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      
      return {
        ...data,
        provider: data.provider as AIProvider,
        agent_configs: data.agent_configs as Partial<Record<AgentType, AgentConfig>> | null,
        provider_api_keys: {}, // Never fetched from DB; presence derived from maskedKeys
        api_key: null,
      } as AISettings;
    },
    enabled: !!user?.id,
  });

  // Fetch masked keys info from edge function
  const { data: maskedKeys } = useQuery({
    queryKey: ['ai-masked-keys', user?.id],
    queryFn: async (): Promise<Record<string, MaskedKeyInfo>> => {
      const response = await supabase.functions.invoke('manage-ai-keys', {
        method: 'GET',
      });
      if (response.error) throw response.error;
      return response.data?.keys || {};
    },
    enabled: !!user?.id && !!settings,
  });

  const updateSettings = useMutation({
    mutationFn: async (input: AISettingsInput) => {
      if (!user?.id) throw new Error('User not authenticated');

      // Send all settings including raw API keys to the edge function
      // The edge function encrypts API keys before storing
      const response = await supabase.functions.invoke('manage-ai-keys', {
        body: {
          provider: input.provider,
          api_key: input.api_key || null,
          preferred_model: input.preferred_model || null,
          agent_configs: input.agent_configs || {},
          provider_api_keys: input.provider_api_keys || {},
        },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-settings', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['ai-masked-keys', user?.id] });
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

  // Helper to check if a provider has a configured API key (derived from server-side masked keys)
  const hasApiKeyForProvider = (provider: AIProvider): boolean => {
    if (provider === 'lovable') return true;
    return !!maskedKeys?.[provider]?.has_key;
  };

  // Helper to get masked key for display
  const getMaskedKeyForProvider = (provider: Exclude<AIProvider, 'lovable'>): string | null => {
    return maskedKeys?.[provider]?.masked || null;
  };

  return {
    settings,
    isLoading,
    error,
    updateSettings,
    validateApiKey,
    maskedKeys,
    hasApiKeyForProvider,
    getMaskedKeyForProvider,
    // Helper to get effective provider (default to lovable)
    effectiveProvider: (settings?.provider || 'lovable') as AIProvider,
    effectiveModel: settings?.preferred_model || PROVIDER_MODELS[settings?.provider || 'lovable'][0]?.value,
  };
}
