import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { getApiKeyForProvider, resolveAIConfig } from "./ai-config.ts";
import type { AISettings } from "./ai-types.ts";

// ===== getApiKeyForProvider (fonction pure) =====

function settings(overrides: Partial<AISettings> = {}): AISettings {
  return {
    provider: "anthropic",
    api_key: null,
    preferred_model: null,
    provider_api_keys: {},
    ...overrides,
  };
}

Deno.test("getApiKeyForProvider: anthropic → null (clé serveur, jamais côté user)", () => {
  assertEquals(getApiKeyForProvider(settings({ api_key: "sk-x" }), "anthropic"), null);
});

Deno.test("getApiKeyForProvider: provider_api_keys prioritaire", () => {
  const s = settings({ provider_api_keys: { openai: "sk-openai" } });
  assertEquals(getApiKeyForProvider(s, "openai"), "sk-openai");
});

Deno.test("getApiKeyForProvider: repli sur api_key legacy si provider courant correspond", () => {
  const s = settings({ provider: "openai", api_key: "sk-legacy" });
  assertEquals(getApiKeyForProvider(s, "openai"), "sk-legacy");
});

Deno.test("getApiKeyForProvider: aucune clé → null", () => {
  assertEquals(getApiKeyForProvider(settings(), "openai"), null);
});

// ===== resolveAIConfig =====

// Chaîne minimale simulant supabaseClient.from().select().eq().maybeSingle()
function fakeSupabase(row: Record<string, unknown> | null, error: unknown = null): SupabaseClient {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: row, error }),
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

// resolveAIConfig lit les clés serveur + le secret de chiffrement dans l'env.
// getUserAISettings appelle decryptProviderKeys (qui exige le secret) ; les clés
// « plaintext » passent par le repli plaintext (échec de déchiffrement → valeur telle quelle).
function setEnv() {
  Deno.env.set("ANTHROPIC_API_KEY", "srv-anthropic");
  Deno.env.set("GEMINI_API_KEY", "srv-gemini");
  Deno.env.set("OPENAI_API_KEY", "srv-openai");
  Deno.env.set("AI_KEYS_ENCRYPTION_SECRET", "test-secret");
}
function clearEnv() {
  Deno.env.delete("ANTHROPIC_API_KEY");
  Deno.env.delete("GEMINI_API_KEY");
  Deno.env.delete("OPENAI_API_KEY");
  Deno.env.delete("AI_KEYS_ENCRYPTION_SECRET");
}

async function withEnv<T>(fn: () => Promise<T>): Promise<T> {
  setEnv();
  try {
    return await fn();
  } finally {
    clearEnv();
  }
}

Deno.test("resolveAIConfig: aucune config → défaut Anthropic + clé serveur", async () => {
  await withEnv(async () => {
    const config = await resolveAIConfig(fakeSupabase(null), "u1", { agentType: "home" });
    assertEquals(config.provider, "anthropic");
    assertEquals(config.model, "claude-sonnet-5");
    assertEquals(config.apiKey, "srv-anthropic");
    assertEquals(config.endpoint, "https://api.anthropic.com/v1/messages");
  });
});

Deno.test("resolveAIConfig: defaultProvider gemini → défaut gemini + clé serveur gemini", async () => {
  await withEnv(async () => {
    const config = await resolveAIConfig(fakeSupabase(null), "u1", {
      agentType: "generate_image",
      defaultProvider: "gemini",
      defaultModel: "gemini-2.5-flash-image",
    });
    assertEquals(config.provider, "gemini");
    assertEquals(config.model, "gemini-2.5-flash-image");
    assertEquals(config.apiKey, "srv-gemini");
    assertEquals(config.endpoint, "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
  });
});

Deno.test("resolveAIConfig: agent config Anthropic → clé serveur + modèle de l'agent", async () => {
  await withEnv(async () => {
    const row = { provider: "anthropic", agent_configs: { home: { provider: "anthropic", model: "claude-opus-4-8" } } };
    const config = await resolveAIConfig(fakeSupabase(row), "u1", { agentType: "home" });
    assertEquals(config.provider, "anthropic");
    assertEquals(config.model, "claude-opus-4-8");
    assertEquals(config.apiKey, "srv-anthropic");
  });
});

Deno.test("resolveAIConfig: agent config OpenAI + clé user + capability OK → utilise OpenAI", async () => {
  await withEnv(async () => {
    const row = {
      provider: "anthropic",
      provider_api_keys: { openai: "sk-user-openai" },
      agent_configs: { home: { provider: "openai", model: "gpt-4o" } },
    };
    const config = await resolveAIConfig(fakeSupabase(row), "u1", {
      agentType: "home",
      requiredCapabilities: ["tools"],
    });
    assertEquals(config.provider, "openai");
    assertEquals(config.model, "gpt-4o");
    assertEquals(config.apiKey, "sk-user-openai");
    assertEquals(config.endpoint, "https://api.openai.com/v1/chat/completions");
  });
});

Deno.test("resolveAIConfig: agent config OpenAI SANS clé → repli sur défaut", async () => {
  await withEnv(async () => {
    const row = { provider: "anthropic", agent_configs: { home: { provider: "openai", model: "gpt-4o" } } };
    const config = await resolveAIConfig(fakeSupabase(row), "u1", { agentType: "home" });
    assertEquals(config.provider, "anthropic");
    assertEquals(config.apiKey, "srv-anthropic");
  });
});

Deno.test("resolveAIConfig: agent config avec modèle sans la capability requise → repli défaut", async () => {
  await withEnv(async () => {
    // gpt-4o ne supporte pas image_generation → repli avant même la clé
    const row = {
      provider: "anthropic",
      provider_api_keys: { openai: "sk-user-openai" },
      agent_configs: { home: { provider: "openai", model: "gpt-4o" } },
    };
    const config = await resolveAIConfig(fakeSupabase(row), "u1", {
      agentType: "home",
      requiredCapabilities: ["image_generation"],
    });
    assertEquals(config.provider, "anthropic");
  });
});

Deno.test("resolveAIConfig: settings globaux OpenAI + clé + capability → utilise le global", async () => {
  await withEnv(async () => {
    const row = {
      provider: "openai",
      preferred_model: "gpt-4o",
      provider_api_keys: { openai: "sk-global" },
    };
    const config = await resolveAIConfig(fakeSupabase(row), "u1", { agentType: "home" });
    assertEquals(config.provider, "openai");
    assertEquals(config.model, "gpt-4o");
    assertEquals(config.apiKey, "sk-global");
  });
});

Deno.test("resolveAIConfig: settings globaux OpenAI SANS clé → repli défaut", async () => {
  await withEnv(async () => {
    const row = { provider: "openai", preferred_model: "gpt-4o", provider_api_keys: {} };
    const config = await resolveAIConfig(fakeSupabase(row), "u1", { agentType: "home" });
    assertEquals(config.provider, "anthropic");
    assertEquals(config.apiKey, "srv-anthropic");
  });
});
