// ===== Shared AI Configuration Resolution =====

import {
  AIConfig,
  AISettings,
  AIProvider,
  PROVIDER_ENDPOINTS,
  DEFAULT_MODELS,
  CAPABILITY_MODELS,
  Capability,
} from "./ai-types.ts";
import { decryptProviderKeys } from "./decrypt-keys.ts";

/** Get the API key for a specific provider from user settings */
export function getApiKeyForProvider(settings: AISettings, provider: string): string | null {
  if (provider === "lovable") return null;
  const providerKey = settings.provider_api_keys?.[provider as keyof typeof settings.provider_api_keys];
  if (providerKey) return providerKey;
  if (settings.provider === provider && settings.api_key) return settings.api_key;
  return null;
}

/** Fetch user AI settings from the database */
export async function getUserAISettings(supabaseClient: any, userId: string): Promise<AISettings> {
  try {
    const { data, error } = await supabaseClient
      .from("user_ai_settings")
      .select("provider, api_key, preferred_model, provider_api_keys, agent_configs")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) {
      return { provider: "lovable", api_key: null, preferred_model: null, provider_api_keys: {} };
    }

    return {
      provider: (data.provider || "lovable") as AIProvider,
      api_key: data.api_key,
      preferred_model: data.preferred_model,
      provider_api_keys: await decryptProviderKeys(data.provider_api_keys || {}),
      agent_configs: data.agent_configs || undefined,
    };
  } catch {
    return { provider: "lovable", api_key: null, preferred_model: null, provider_api_keys: {} };
  }
}

export interface ResolveOptions {
  agentType: string;
  defaultModel?: string;
  requiredCapabilities?: Capability[];
}

/**
 * Resolve the AI configuration for a given agent type and user.
 * Priority: agent-specific config > global user settings > default (Lovable).
 * Validates required capabilities and falls back to default if not met.
 */
export async function resolveAIConfig(
  supabaseClient: any,
  userId: string,
  options: ResolveOptions
): Promise<AIConfig> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const defaultModel = options.defaultModel || DEFAULT_MODELS.lovable;

  const defaultConfig: AIConfig = {
    provider: "lovable",
    model: defaultModel,
    apiKey: LOVABLE_API_KEY || "",
    endpoint: PROVIDER_ENDPOINTS.lovable,
  };

  console.log(`[AI Config] Resolving for agent: ${options.agentType}, user: ${userId}`);

  const settings = await getUserAISettings(supabaseClient, userId);

  console.log(`[AI Config] Global: ${settings.provider}/${settings.preferred_model}`);
  console.log(`[AI Config] Agent configs: ${Object.keys(settings.agent_configs || {}).join(", ") || "none"}`);
  console.log(`[AI Config] Provider keys: ${Object.keys(settings.provider_api_keys || {}).join(", ") || "none"}`);

  // 1. Check agent-specific config
  const agentConfig = settings.agent_configs?.[options.agentType];

  if (agentConfig?.provider && agentConfig?.model) {
    console.log(`[AI Config] Found agent config: ${agentConfig.provider}/${agentConfig.model}`);

    if (agentConfig.provider === "lovable") {
      return { provider: "lovable", model: agentConfig.model, apiKey: LOVABLE_API_KEY || "", endpoint: PROVIDER_ENDPOINTS.lovable };
    }

    if (!validateCapabilities(agentConfig.model, options.requiredCapabilities)) {
      return defaultConfig;
    }

    const apiKey = getApiKeyForProvider(settings, agentConfig.provider);
    if (!apiKey) {
      console.warn(`[AI Config] No API key for ${agentConfig.provider}, falling back to default`);
      return defaultConfig;
    }

    return {
      provider: agentConfig.provider,
      model: agentConfig.model,
      apiKey,
      endpoint: PROVIDER_ENDPOINTS[agentConfig.provider] || PROVIDER_ENDPOINTS.lovable,
    };
  }

  // 2. Fall back to global user settings
  if (settings.provider && settings.provider !== "lovable" && settings.preferred_model) {
    const globalApiKey = getApiKeyForProvider(settings, settings.provider);

    if (globalApiKey && validateCapabilities(settings.preferred_model!, options.requiredCapabilities)) {
      console.log(`[AI Config] Using global: ${settings.provider}/${settings.preferred_model}`);
      return {
        provider: settings.provider,
        model: settings.preferred_model!,
        apiKey: globalApiKey,
        endpoint: PROVIDER_ENDPOINTS[settings.provider] || PROVIDER_ENDPOINTS.lovable,
      };
    }
  }

  console.log(`[AI Config] Using default: ${defaultConfig.provider}/${defaultConfig.model}`);
  return defaultConfig;
}

/** Validate that a model supports all required capabilities */
function validateCapabilities(model: string, required?: Capability[]): boolean {
  if (!required?.length) return true;
  for (const cap of required) {
    if (!CAPABILITY_MODELS[cap]?.includes(model)) {
      console.warn(`[AI Config] Model ${model} doesn't support ${cap}, falling back to default`);
      return false;
    }
  }
  return true;
}
