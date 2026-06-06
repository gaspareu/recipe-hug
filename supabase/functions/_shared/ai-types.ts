// ===== Shared AI Types & Constants =====

export type AIProvider = "anthropic" | "gemini" | "openai";

export interface ProviderApiKeys {
  gemini?: string;
  openai?: string;
  anthropic?: string;
}

export interface AISettings {
  provider: AIProvider;
  api_key: string | null;
  preferred_model: string | null;
  provider_api_keys: ProviderApiKeys;
  agent_configs?: Record<string, { provider: string; model: string }>;
}

export interface AIConfig {
  provider: string;
  model: string;
  apiKey: string;
  endpoint: string;
}

export const PROVIDER_ENDPOINTS: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
};

export const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: "claude-sonnet-4-20250514",
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o",
};

// Capability lists for model validation
export const TOOL_CAPABLE_MODELS = [
  // Direct Gemini
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  // Direct OpenAI
  "gpt-4o",
  "gpt-4o-mini",
  "o3-mini",
  // Direct Anthropic
  "claude-sonnet-4-20250514",
  "claude-3-7-sonnet-20250219",
  "claude-3-5-haiku-20241022",
];

export const VISION_MODELS = [
  // Direct Gemini
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  // Direct OpenAI
  "gpt-4o",
  "gpt-4o-mini",
  // Direct Anthropic
  "claude-sonnet-4-20250514",
  "claude-3-7-sonnet-20250219",
];

export const IMAGE_GEN_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-3.1-flash-image",
  "dall-e-3",
];

export type Capability = "tools" | "vision" | "image_generation";

export const CAPABILITY_MODELS: Record<Capability, string[]> = {
  tools: TOOL_CAPABLE_MODELS,
  vision: VISION_MODELS,
  image_generation: IMAGE_GEN_MODELS,
};
