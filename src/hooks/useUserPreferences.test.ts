import { renderHook, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { createQueryWrapper, createTestQueryClient } from "@/test/query-client";
import { createSupabaseMock, type SupabaseMockOptions } from "@/test/supabase-mock";
import type { UserCulinaryPreferences } from "./useUserPreferences";

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() }, auth: {} },
}));
const { mockAuth } = vi.hoisted(() => ({ mockAuth: { user: null as { id: string } | null } }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("./useAuth", () => ({ useAuth: () => mockAuth }));

import {
  useUserPreferences,
  formatPreferencesForContext,
  formatFavoritesForContext,
} from "./useUserPreferences";

function installSupabase(options: SupabaseMockOptions = {}) {
  const sb = createSupabaseMock(options);
  Object.assign(mockSupabase, sb);
  return sb;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.user = null;
});

// ---------------------------------------------------------------------------
// formatPreferencesForContext (fonction pure)
// ---------------------------------------------------------------------------
function emptyPrefs(): UserCulinaryPreferences {
  return {
    id: "p1",
    user_id: "u1",
    created_at: "",
    updated_at: "",
    taste_preferences: {
      liked_flavors: [],
      disliked_flavors: [],
      liked_ingredients: [],
      disliked_ingredients: [],
      special_ingredients: [],
    },
    kitchen_equipment: { available: [], unavailable: [] },
    culinary_style: { favorite_cuisines: [], favorite_techniques: [], preferred_difficulty: null },
    dietary_constraints: { allergies: [], diets: [], restrictions: [] },
  };
}

describe("formatPreferencesForContext", () => {
  it("retourne une chaîne vide pour des préférences nulles", () => {
    expect(formatPreferencesForContext(null)).toBe("");
  });

  it("retourne une chaîne vide quand toutes les sections sont vides", () => {
    expect(formatPreferencesForContext(emptyPrefs())).toBe("");
  });

  it("inclut les saveurs aimées et encadre par les marqueurs de profil", () => {
    const prefs = emptyPrefs();
    prefs.taste_preferences.liked_flavors = ["sucré", "acidulé"];
    const result = formatPreferencesForContext(prefs);
    expect(result).toContain("Saveurs aimées : sucré, acidulé");
    expect(result).toContain("--- PROFIL CULINAIRE ---");
    expect(result).toContain("--- FIN PROFIL ---");
  });

  it("met en évidence les allergies avec un avertissement", () => {
    const prefs = emptyPrefs();
    prefs.dietary_constraints.allergies = ["arachides"];
    const result = formatPreferencesForContext(prefs);
    expect(result).toContain("⚠️ Allergies : arachides");
  });

  it("inclut le niveau de difficulté préféré", () => {
    const prefs = emptyPrefs();
    prefs.culinary_style.preferred_difficulty = "facile";
    const result = formatPreferencesForContext(prefs);
    expect(result).toContain("Niveau préféré : facile");
  });

  it("gère l'absence de special_ingredients sans planter", () => {
    const prefs = emptyPrefs();
    // @ts-expect-error simulation d'anciennes données sans ce champ
    delete prefs.taste_preferences.special_ingredients;
    prefs.taste_preferences.liked_flavors = ["umami"];
    expect(() => formatPreferencesForContext(prefs)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// formatFavoritesForContext (fonction pure)
// ---------------------------------------------------------------------------
describe("formatFavoritesForContext", () => {
  it("retourne une chaîne vide sans recette", () => {
    expect(formatFavoritesForContext([])).toBe("");
  });

  it("formate le titre avec saison et tags", () => {
    const result = formatFavoritesForContext([
      { title: "Soupe", season: "hiver", nutrition_tags: ["vegan"] },
    ]);
    expect(result).toContain("1. Soupe (hiver, vegan)");
  });

  it("omet la parenthèse quand il n'y a ni saison ni tags", () => {
    const result = formatFavoritesForContext([
      { title: "Pain", season: null, nutrition_tags: null },
    ]);
    expect(result).toContain("1. Pain");
    expect(result).not.toContain("Pain (");
  });

  it("limite la liste aux 5 premières recettes", () => {
    const recipes = Array.from({ length: 8 }, (_, i) => ({
      title: `R${i}`,
      season: null,
      nutrition_tags: null,
    }));
    const result = formatFavoritesForContext(recipes);
    expect(result).toContain("5. R4");
    expect(result).not.toContain("6. R5");
  });
});

// ---------------------------------------------------------------------------
// useUserPreferences (hook)
// ---------------------------------------------------------------------------
describe("useUserPreferences", () => {
  it("retourne les préférences parsées pour l'utilisateur courant", async () => {
    mockAuth.user = { id: "u1" };
    installSupabase({
      resultsByTable: {
        user_culinary_preferences: {
          data: { id: "p1", user_id: "u1", taste_preferences: { liked_flavors: ["sucré"] } },
          error: null,
        },
      },
    });
    const { result } = renderHook(() => useUserPreferences(), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.preferences).toBeTruthy());
    expect(result.current.preferences?.id).toBe("p1");
  });

  it("emprunte la branche UPDATE quand des préférences existent déjà", async () => {
    mockAuth.user = { id: "u1" };
    const sb = installSupabase({
      resultsByTable: {
        user_culinary_preferences: { data: { id: "p1" }, error: null },
      },
    });
    const { result } = renderHook(() => useUserPreferences(), { wrapper: createQueryWrapper() });

    result.current.updatePreferences({ taste_preferences: emptyPrefs().taste_preferences });

    await waitFor(() => {
      const builders = sb.from.mock.results.map((r) => r.value);
      expect(builders.some((b) => b.update.mock.calls.length > 0)).toBe(true);
    });
    const builders = sb.from.mock.results.map((r) => r.value);
    expect(builders.some((b) => b.insert.mock.calls.length > 0)).toBe(false);
  });

  it("emprunte la branche INSERT quand aucune préférence n'existe", async () => {
    mockAuth.user = { id: "u1" };
    const sb = installSupabase({
      resultsByTable: {
        user_culinary_preferences: { data: null, error: null },
      },
    });
    const { result } = renderHook(() => useUserPreferences(), { wrapper: createQueryWrapper() });

    result.current.updatePreferences({ taste_preferences: emptyPrefs().taste_preferences });

    await waitFor(() => {
      const builders = sb.from.mock.results.map((r) => r.value);
      expect(builders.some((b) => b.insert.mock.calls.length > 0)).toBe(true);
    });
  });

  it("n'écrit rien en base si l'utilisateur n'est pas authentifié", async () => {
    mockAuth.user = null;
    const sb = installSupabase();
    const { result } = renderHook(() => useUserPreferences(), { wrapper: createQueryWrapper() });

    result.current.updatePreferences({ taste_preferences: emptyPrefs().taste_preferences });
    await waitFor(() => expect(result.current.isUpdating).toBe(false));

    // mutationFn lève 'Not authenticated' avant tout appel à from() : aucun builder créé.
    expect(sb.from).not.toHaveBeenCalled();
  });
});
