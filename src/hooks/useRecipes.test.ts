import { renderHook, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { createQueryWrapper, createTestQueryClient } from "@/test/query-client";
import { createSupabaseMock, type SupabaseMockOptions } from "@/test/supabase-mock";

// Le client supabase importé doit être une référence stable que l'on
// reconfigure par test (vi.mock est hoisté → on passe par vi.hoisted).
const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn(), getSession: vi.fn() },
  },
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

import {
  parseRecipe,
  useRecipes,
  useRecipe,
  useCreateRecipe,
  useUpdateRecipe,
  useDeleteRecipe,
  useToggleFavorite,
} from "./useRecipes";

/** Reconfigure le mock supabase partagé pour le test courant. */
function installSupabase(options: SupabaseMockOptions = {}) {
  const sb = createSupabaseMock(options);
  mockSupabase.from = sb.from;
  mockSupabase.auth = sb.auth;
  return sb;
}

beforeEach(() => {
  vi.clearAllMocks();
  // triggerImageGeneration (fire-and-forget) appelle fetch — on le neutralise.
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, text: () => Promise.resolve("") } as Response),
  );
});

// ---------------------------------------------------------------------------
// parseRecipe (fonction pure)
// ---------------------------------------------------------------------------
describe("parseRecipe", () => {
  it("conserve les ingrédients et étapes fournis", () => {
    const data = {
      id: "1",
      title: "Tarte",
      ingredients: [{ name: "Pomme", quantity: 3, unit: null }],
      steps: [{ description: "Éplucher" }],
    };
    const result = parseRecipe(data);
    expect(result.ingredients).toEqual([{ name: "Pomme", quantity: 3, unit: null }]);
    expect(result.steps).toEqual([{ description: "Éplucher" }]);
  });

  it("remplace des ingrédients null par un tableau vide", () => {
    const result = parseRecipe({ id: "1", title: "X", ingredients: null, steps: null });
    expect(result.ingredients).toEqual([]);
    expect(result.steps).toEqual([]);
  });

  it("remplace des ingrédients absents par un tableau vide", () => {
    const result = parseRecipe({ id: "1", title: "X" });
    expect(result.ingredients).toEqual([]);
    expect(result.steps).toEqual([]);
  });

  it("préserve les autres champs de la recette", () => {
    const result = parseRecipe({
      id: "abc",
      title: "Soupe",
      status: "validated",
      is_favorite: true,
      servings: 4,
    });
    expect(result.id).toBe("abc");
    expect(result.title).toBe("Soupe");
    expect(result.status).toBe("validated");
    expect(result.is_favorite).toBe(true);
    expect(result.servings).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// useRecipes
// ---------------------------------------------------------------------------
describe("useRecipes", () => {
  it("échoue avec 'Not authenticated' si aucun utilisateur", async () => {
    installSupabase({ user: null });
    const { result } = renderHook(() => useRecipes(), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe("Not authenticated");
  });

  it("retourne les recettes parsées quand l'utilisateur est connecté", async () => {
    installSupabase({
      user: { id: "u1" },
      resultsByTable: {
        recipes: { data: [{ id: "r1", title: "T", ingredients: null, steps: null }], error: null },
      },
    });
    const { result } = renderHook(() => useRecipes(), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0]).toMatchObject({ id: "r1", ingredients: [], steps: [] });
  });

  it("propage une erreur de requête", async () => {
    installSupabase({
      user: { id: "u1" },
      resultsByTable: { recipes: { data: null, error: { message: "db down" } } },
    });
    const { result } = renderHook(() => useRecipes(), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// ---------------------------------------------------------------------------
// useRecipe
// ---------------------------------------------------------------------------
describe("useRecipe", () => {
  it("retourne la recette parsée pour un id donné", async () => {
    installSupabase({
      resultsByTable: {
        recipes: { data: { id: "r1", title: "T", ingredients: null, steps: null }, error: null },
      },
    });
    const { result } = renderHook(() => useRecipe("r1"), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ id: "r1", ingredients: [], steps: [] });
  });

  it("retourne null quand aucune recette n'est trouvée", async () => {
    installSupabase({ resultsByTable: { recipes: { data: null, error: null } } });
    const { result } = renderHook(() => useRecipe("absent"), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("reste inactif quand aucun id n'est fourni", () => {
    installSupabase();
    const { result } = renderHook(() => useRecipe(""), { wrapper: createQueryWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useCreateRecipe
// ---------------------------------------------------------------------------
const FORM = {
  title: "Nouvelle",
  status: "draft" as const,
  is_favorite: false,
  servings: 2,
  ingredients: [],
  steps: [],
  season: null,
  nutrition_tags: null,
  calorie_score: null,
  ai_summary: null,
  source_type: null,
  source_image_url: null,
};

describe("useCreateRecipe", () => {
  it("échoue si l'utilisateur n'est pas authentifié", async () => {
    installSupabase({ user: null });
    const { result } = renderHook(() => useCreateRecipe(), { wrapper: createQueryWrapper() });
    await expect(result.current.mutateAsync({ ...FORM })).rejects.toThrow("Not authenticated");
  });

  it("insère la recette, la retourne parsée et invalide le cache", async () => {
    installSupabase({
      user: { id: "u1" },
      session: { access_token: "tok" },
      result: { data: { id: "new", title: "Nouvelle", ingredients: null, steps: null }, error: null },
    });
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useCreateRecipe(), {
      wrapper: createQueryWrapper(client),
    });

    const created = await result.current.mutateAsync({ ...FORM, skipImageGeneration: true });
    expect(created).toMatchObject({ id: "new", ingredients: [], steps: [] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["recipes"] });
  });

  it("ne déclenche pas la génération d'image si skipImageGeneration est vrai", async () => {
    installSupabase({
      user: { id: "u1" },
      session: { access_token: "tok" },
      result: { data: { id: "new", title: "N", ingredients: null, steps: null }, error: null },
    });
    const { result } = renderHook(() => useCreateRecipe(), { wrapper: createQueryWrapper() });
    await result.current.mutateAsync({ ...FORM, skipImageGeneration: true });
    await Promise.resolve();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("déclenche la génération d'image quand aucune image source n'existe", async () => {
    installSupabase({
      user: { id: "u1" },
      session: { access_token: "tok" },
      result: { data: { id: "new", title: "N", ingredients: null, steps: null }, error: null },
    });
    const { result } = renderHook(() => useCreateRecipe(), { wrapper: createQueryWrapper() });
    await result.current.mutateAsync({ ...FORM });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  });
});

// ---------------------------------------------------------------------------
// useUpdateRecipe
// ---------------------------------------------------------------------------
describe("useUpdateRecipe", () => {
  it("met à jour, retourne la recette parsée et invalide les deux caches", async () => {
    installSupabase({
      result: { data: { id: "r1", title: "MAJ", ingredients: null, steps: null }, error: null },
    });
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useUpdateRecipe(), {
      wrapper: createQueryWrapper(client),
    });

    const updated = await result.current.mutateAsync({ id: "r1", title: "MAJ" });
    expect(updated).toMatchObject({ id: "r1", title: "MAJ" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["recipes"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["recipe", "r1"] });
  });
});

// ---------------------------------------------------------------------------
// useDeleteRecipe
// ---------------------------------------------------------------------------
describe("useDeleteRecipe", () => {
  it("supprime et invalide le cache des recettes", async () => {
    installSupabase({ result: { data: null, error: null } });
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useDeleteRecipe(), {
      wrapper: createQueryWrapper(client),
    });

    await result.current.mutateAsync("r1");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["recipes"] });
  });

  it("propage une erreur de suppression", async () => {
    installSupabase({ result: { data: null, error: { message: "boom" } } });
    const { result } = renderHook(() => useDeleteRecipe(), { wrapper: createQueryWrapper() });
    await expect(result.current.mutateAsync("r1")).rejects.toMatchObject({ message: "boom" });
  });
});

// ---------------------------------------------------------------------------
// useToggleFavorite (mise à jour optimiste + rollback)
// ---------------------------------------------------------------------------
describe("useToggleFavorite", () => {
  function seed(client = createTestQueryClient()) {
    client.setQueryData(["recipes"], [{ id: "r1", is_favorite: false }]);
    client.setQueryData(["recipe", "r1"], { id: "r1", is_favorite: false });
    return client;
  }

  it("applique la mise à jour optimiste dans les deux caches", async () => {
    installSupabase({ result: { data: null, error: null } });
    const client = seed();
    const { result } = renderHook(() => useToggleFavorite(), {
      wrapper: createQueryWrapper(client),
    });

    result.current.mutate({ id: "r1", is_favorite: true });

    await waitFor(() => {
      const list = client.getQueryData(["recipes"]) as Array<{ id: string; is_favorite: boolean }>;
      expect(list[0].is_favorite).toBe(true);
    });
    expect(client.getQueryData(["recipe", "r1"])).toMatchObject({ is_favorite: true });
  });

  it("annule la mise à jour optimiste (rollback) en cas d'erreur", async () => {
    installSupabase({ result: { data: null, error: { message: "boom" } } });
    const client = seed();
    const { result } = renderHook(() => useToggleFavorite(), {
      wrapper: createQueryWrapper(client),
    });

    result.current.mutate({ id: "r1", is_favorite: true });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const list = client.getQueryData(["recipes"]) as Array<{ id: string; is_favorite: boolean }>;
    expect(list[0].is_favorite).toBe(false);
    expect(client.getQueryData(["recipe", "r1"])).toMatchObject({ is_favorite: false });
  });
});
