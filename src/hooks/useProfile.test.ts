import { renderHook, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { createQueryWrapper, createTestQueryClient } from "@/test/query-client";
import { createSupabaseMock, type SupabaseMockOptions } from "@/test/supabase-mock";

const { mockSupabase } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockSupabase: { from: vi.fn(), auth: {}, storage: { from: vi.fn() } } as any,
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

import { useProfile, useUpdateProfile, useUploadAvatar } from "./useProfile";

function installSupabase(options: SupabaseMockOptions = {}) {
  const sb = createSupabaseMock(options);
  mockSupabase.from = sb.from;
  mockSupabase.auth = sb.auth;
  return sb;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useProfile", () => {
  it("récupère display_name et avatar_url depuis profiles_safe", async () => {
    installSupabase({
      resultsByTable: {
        profiles_safe: { data: { display_name: "Alice", avatar_url: "u.png" }, error: null },
      },
    });
    const { result } = renderHook(() => useProfile("u1"), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ display_name: "Alice", avatar_url: "u.png" });
  });

  it("reste inactif sans identifiant utilisateur", () => {
    installSupabase();
    const { result } = renderHook(() => useProfile(undefined), { wrapper: createQueryWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });
});

describe("useUpdateProfile", () => {
  it("met à jour display_name et invalide le cache profil", async () => {
    installSupabase({ result: { data: null, error: null } });
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useUpdateProfile(), {
      wrapper: createQueryWrapper(client),
    });

    await result.current.mutateAsync({ userId: "u1", displayName: "Bob" });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["profile", "u1"] });
  });

  it("propage une erreur de mise à jour", async () => {
    installSupabase({ result: { data: null, error: { message: "boom" } } });
    const { result } = renderHook(() => useUpdateProfile(), { wrapper: createQueryWrapper() });
    await expect(
      result.current.mutateAsync({ userId: "u1", displayName: "Bob" }),
    ).rejects.toMatchObject({ message: "boom" });
  });
});

describe("useUploadAvatar", () => {
  it("téléverse l'avatar, met à jour profiles et retourne l'URL publique", async () => {
    installSupabase({ result: { data: null, error: null } });
    const upload = vi.fn(() => Promise.resolve({ error: null }));
    const getPublicUrl = vi.fn(() => ({ data: { publicUrl: "https://cdn/u1/avatar.png" } }));
    mockSupabase.storage = { from: vi.fn(() => ({ upload, getPublicUrl })) };

    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useUploadAvatar(), {
      wrapper: createQueryWrapper(client),
    });

    const file = new File(["x"], "photo.png", { type: "image/png" });
    const url = await result.current.mutateAsync({ userId: "u1", file });

    expect(upload).toHaveBeenCalledWith("u1/avatar.png", file, { upsert: true });
    expect(url).toBe("https://cdn/u1/avatar.png");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["profile", "u1"] });
  });
});
