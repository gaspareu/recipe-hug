import { renderHook } from "@testing-library/react";
import { vi } from "vitest";
import { createQueryWrapper, createTestQueryClient } from "@/test/query-client";
import { createSupabaseMock, type SupabaseMockOptions } from "@/test/supabase-mock";
import type { RecipeVersion } from "./useRecipeVersions";

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn(), getSession: vi.fn() },
  },
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

import { useRestoreVersion } from "./useRecipeVersions";

function installSupabase(options: SupabaseMockOptions = {}) {
  const sb = createSupabaseMock(options);
  mockSupabase.from = sb.from;
  mockSupabase.auth = sb.auth;
  return sb;
}

const VERSION: RecipeVersion = {
  id: "v1",
  recipe_id: "r1",
  user_id: "u1",
  version_number: 2,
  title: "Tarte v2",
  servings: 4,
  ingredients: [],
  steps: [],
  season: null,
  nutrition_tags: null,
  change_description: null,
  created_at: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useRestoreVersion", () => {
  it("restaure la version et invalide les caches recette ET liste", async () => {
    installSupabase({ result: { data: null, error: null } });
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useRestoreVersion(), {
      wrapper: createQueryWrapper(client),
    });

    await result.current.mutateAsync({ version: VERSION, recipeId: "r1" });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["recipe", "r1"] });
    // La liste affiche titre/portions : elle doit aussi être rafraîchie après restauration.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["recipes"] });
  });

  it("propage une erreur de restauration", async () => {
    installSupabase({ result: { data: null, error: { message: "boom" } } });
    const { result } = renderHook(() => useRestoreVersion(), {
      wrapper: createQueryWrapper(),
    });

    await expect(
      result.current.mutateAsync({ version: VERSION, recipeId: "r1" }),
    ).rejects.toMatchObject({ message: "boom" });
  });
});
