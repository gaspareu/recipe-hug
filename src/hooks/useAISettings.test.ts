import { renderHook, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import { createSupabaseMock, type SupabaseMockOptions } from "@/test/supabase-mock";

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() }, auth: {} },
}));
const { mockAuth } = vi.hoisted(() => ({ mockAuth: { user: null as { id: string } | null } }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mockAuth }));

import { getCompatibleModels, useAISettings } from "./useAISettings";

function installSupabase(options: SupabaseMockOptions = {}) {
  Object.assign(mockSupabase, createSupabaseMock(options));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.user = null;
});

// ---------------------------------------------------------------------------
// getCompatibleModels (fonction pure)
// ---------------------------------------------------------------------------
describe("getCompatibleModels", () => {
  it("ne retourne que des modèles vision pour parse_image", () => {
    const models = getCompatibleModels("parse_image");
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.capabilities.includes("vision"))).toBe(true);
  });

  it("ne retourne que des modèles de génération d'image pour generate_image", () => {
    const models = getCompatibleModels("generate_image");
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.capabilities.includes("image_generation"))).toBe(true);
    expect(models.some((m) => m.value === "dall-e-3")).toBe(true);
  });

  it("exige text+streaming+tools pour le chat et inclut le provider", () => {
    const models = getCompatibleModels("chat");
    expect(models.length).toBeGreaterThan(0);
    expect(
      models.every(
        (m) =>
          m.capabilities.includes("text") &&
          m.capabilities.includes("streaming") &&
          m.capabilities.includes("tools"),
      ),
    ).toBe(true);
    expect(models[0]).toHaveProperty("provider");
  });
});

// ---------------------------------------------------------------------------
// useAISettings (hook) — comportements par défaut sans config
// ---------------------------------------------------------------------------
describe("useAISettings", () => {
  it("utilise anthropic comme provider effectif par défaut", async () => {
    mockAuth.user = { id: "u1" };
    installSupabase({
      resultsByTable: { user_ai_settings_safe: { data: null, error: null } },
    });
    const { result } = renderHook(() => useAISettings(), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.effectiveProvider).toBe("anthropic");
    expect(result.current.effectiveModel).toBe("claude-sonnet-4-6");
  });

  it("considère toujours qu'anthropic a une clé (gérée côté serveur)", async () => {
    mockAuth.user = { id: "u1" };
    installSupabase({
      resultsByTable: { user_ai_settings_safe: { data: null, error: null } },
    });
    const { result } = renderHook(() => useAISettings(), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasApiKeyForProvider("anthropic")).toBe(true);
    expect(result.current.hasApiKeyForProvider("openai")).toBe(false);
  });
});
