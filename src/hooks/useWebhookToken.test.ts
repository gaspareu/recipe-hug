import { renderHook, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { createSupabaseMock, type SupabaseMockOptions } from "@/test/supabase-mock";

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() }, auth: {} },
}));
const { mockAuth } = vi.hoisted(() => ({ mockAuth: { user: null as { id: string } | null } }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("./useAuth", () => ({ useAuth: () => mockAuth }));

import { useWebhookToken } from "./useWebhookToken";

function installSupabase(options: SupabaseMockOptions = {}) {
  const sb = createSupabaseMock(options);
  Object.assign(mockSupabase, sb);
  return sb;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.user = null;
});

describe("useWebhookToken", () => {
  it("récupère le token via RPC sécurisée au montage si l'utilisateur est connecté", async () => {
    mockAuth.user = { id: "u1" };
    const sb = installSupabase({
      rpcResultsByName: { get_my_webhook_token: { data: "tok-123", error: null } },
    });
    const { result } = renderHook(() => useWebhookToken());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(sb.rpc).toHaveBeenCalledWith("get_my_webhook_token");
    expect(result.current.webhookToken).toBe("tok-123");
  });

  it("ne récupère rien et n'est pas en chargement sans utilisateur", () => {
    mockAuth.user = null;
    const sb = installSupabase();
    const { result } = renderHook(() => useWebhookToken());

    expect(sb.rpc).not.toHaveBeenCalled();
    // Rien à charger sans utilisateur : isLoading ne doit pas rester bloqué à true.
    expect(result.current.isLoading).toBe(false);
    expect(result.current.webhookToken).toBeNull();
  });

  it("génère un nouveau token et le mémorise", async () => {
    mockAuth.user = { id: "u1" };
    const sb = installSupabase({
      rpcResultsByName: {
        get_my_webhook_token: { data: null, error: null },
        generate_webhook_token: { data: "new-tok", error: null },
      },
    });
    const { result } = renderHook(() => useWebhookToken());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let returned: string | null = null;
    await waitFor(async () => {
      returned = (await result.current.generateToken()) as string | null;
    });

    expect(sb.rpc).toHaveBeenCalledWith("generate_webhook_token", { user_uuid: "u1" });
    expect(returned).toBe("new-tok");
    expect(result.current.webhookToken).toBe("new-tok");
  });

  it("retourne null si la génération échoue", async () => {
    mockAuth.user = { id: "u1" };
    installSupabase({
      rpcResultsByName: {
        get_my_webhook_token: { data: null, error: null },
        generate_webhook_token: { data: null, error: { message: "boom" } },
      },
    });
    const { result } = renderHook(() => useWebhookToken());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const returned = await result.current.generateToken();
    expect(returned).toBeNull();
  });

  it("copie un texte dans le presse-papier", async () => {
    mockAuth.user = { id: "u1" };
    installSupabase({ rpcResultsByName: { get_my_webhook_token: { data: "x", error: null } } });
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });

    const { result } = renderHook(() => useWebhookToken());
    await result.current.copyToClipboard("hello");

    expect(writeText).toHaveBeenCalledWith("hello");
  });
});
