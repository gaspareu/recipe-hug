import { renderHook, act, waitFor } from "@testing-library/react";
import { vi, type Mock } from "vitest";
import { createSupabaseMock, type SupabaseMockOptions } from "@/test/supabase-mock";
import { sseResponse, toolCallEvent, contentEvent } from "@/test/sse";
import type { Recipe } from "@/types/recipe";
import type { UserCulinaryPreferences } from "./useUserPreferences";

const { mockSupabase, mockNavigate, mockRefetch, mockUpdatePreferences, hookState } = vi.hoisted(
  () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockSupabase: { from: vi.fn(), auth: { getSession: vi.fn(), getUser: vi.fn() } } as any,
    mockNavigate: vi.fn(),
    mockRefetch: vi.fn(() => Promise.resolve()),
    mockUpdatePreferences: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hookState: { recipes: [] as any[], preferences: null as any },
  }),
);

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }));
vi.mock("./useRecipes", () => ({
  useRecipes: () => ({ data: hookState.recipes, refetch: mockRefetch }),
}));
vi.mock("./useUserPreferences", () => ({
  useUserPreferences: () => ({
    preferences: hookState.preferences,
    updatePreferences: mockUpdatePreferences,
  }),
}));
vi.mock("@/lib/recipe-completion", () => ({
  triggerRecipeCompletion: vi.fn(() => Promise.resolve()),
}));

import { useHomeChat, type ChatMessage } from "./useHomeChat";
import { triggerRecipeCompletion } from "@/lib/recipe-completion";

const SESSION = { access_token: "tok", user: { id: "u1" } };

const fetchMock = vi.fn();

function lastMessage(messages: ChatMessage[]): ChatMessage {
  return messages[messages.length - 1];
}

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "r1",
    user_id: "u1",
    title: "Tarte aux pommes",
    status: "validated",
    is_favorite: true,
    servings: 4,
    ingredients: [{ name: "Pomme", quantity: 3, unit: "pièce" }],
    steps: [{ order: 1, text: "Éplucher les pommes" }],
    season: null,
    nutrition_tags: null,
    calorie_score: null,
    ai_summary: null,
    source_type: "manual",
    source_image_url: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  };
}

function makePreferences(): UserCulinaryPreferences {
  return {
    id: "p1",
    user_id: "u1",
    created_at: "",
    updated_at: "",
    taste_preferences: {
      liked_flavors: ["sucré"],
      disliked_flavors: [],
      liked_ingredients: [],
      disliked_ingredients: [],
      special_ingredients: [],
    },
    kitchen_equipment: { available: ["four"], unavailable: [] },
    culinary_style: { favorite_cuisines: [], favorite_techniques: [], preferred_difficulty: null },
    dietary_constraints: { allergies: ["gluten"], diets: [], restrictions: [] },
  };
}

const PENDING_RECIPE = {
  title: "Tarte Tatin",
  servings: 6,
  ingredients: [{ name: "Pomme", quantity: 6, unit: "pièce" }],
  steps: [{ order: 1, text: "Caraméliser" }],
};

/** Reconfigure le mock supabase partagé (session authentifiée par défaut). */
function installSupabase(options: SupabaseMockOptions = {}) {
  const sb = createSupabaseMock({ session: SESSION, ...options });
  Object.assign(mockSupabase, sb);
  return sb;
}

/** Renvoie les query builders créés pour une table donnée, dans l'ordre. */
function buildersFor(table: string) {
  const from = mockSupabase.from as Mock;
  return from.mock.calls
    .map((call, i) => ({ table: call[0] as string, builder: from.mock.results[i].value }))
    .filter((entry) => entry.table === table)
    .map((entry) => entry.builder);
}

/** Envoie un message dont la réponse streamée contient un unique tool call. */
async function sendToolCall(
  result: { current: ReturnType<typeof useHomeChat> },
  name: string,
  args: Record<string, unknown>,
) {
  fetchMock.mockResolvedValueOnce(sseResponse([toolCallEvent(name, args)]));
  await act(() => result.current.sendMessage("message de test"));
}

beforeEach(() => {
  vi.clearAllMocks();
  hookState.recipes = [
    makeRecipe(),
    makeRecipe({ id: "r2", title: "Soupe à l'oignon", status: "draft", is_favorite: false }),
  ];
  hookState.preferences = makePreferences();
  mockRefetch.mockImplementation(() => Promise.resolve());
  installSupabase();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(sseResponse([contentEvent("Ok")]));
});

// ---------------------------------------------------------------------------
// Flow : création d'une recette via le chat
// ---------------------------------------------------------------------------
describe("useHomeChat — création de recette", () => {
  it("save_recipe met la recette en attente de confirmation", async () => {
    const { result } = renderHook(() => useHomeChat());

    await sendToolCall(result, "save_recipe", PENDING_RECIPE);

    expect(result.current.pendingRecipe).toMatchObject({ title: "Tarte Tatin", servings: 6 });
  });

  it("savePendingRecipe insère la recette en brouillon IA et confirme dans le chat", async () => {
    installSupabase({
      resultsByTable: { recipes: { data: { id: "new-1" }, error: null } },
    });
    const { result } = renderHook(() => useHomeChat());
    await sendToolCall(result, "save_recipe", PENDING_RECIPE);

    await act(() => result.current.savePendingRecipe());

    const [recipesBuilder] = buildersFor("recipes");
    expect(recipesBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "u1",
        title: "Tarte Tatin",
        servings: 6,
        source_type: "ai",
        status: "draft",
      }),
    );
    expect(result.current.pendingRecipe).toBeNull();
    expect(mockRefetch).toHaveBeenCalled();
    expect(lastMessage(result.current.messages).content).toContain(
      '✅ J\'ai enregistré ta nouvelle recette "Tarte Tatin"',
    );
  });

  it("déclenche la génération d'image en arrière-plan après l'insertion", async () => {
    installSupabase({
      resultsByTable: { recipes: { data: { id: "new-1" }, error: null } },
    });
    const { result } = renderHook(() => useHomeChat());
    await sendToolCall(result, "save_recipe", PENDING_RECIPE);

    await act(() => result.current.savePendingRecipe());

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("generate-recipe-image"))).toBe(true);
    });
  });

  it("cancelPendingRecipe abandonne la recette en attente et relance la discussion", async () => {
    const { result } = renderHook(() => useHomeChat());
    await sendToolCall(result, "save_recipe", PENDING_RECIPE);

    act(() => result.current.cancelPendingRecipe());

    expect(result.current.pendingRecipe).toBeNull();
    expect(lastMessage(result.current.messages).content).toContain("on continue la discussion");
  });
});

// ---------------------------------------------------------------------------
// Flow : complétion description/tags après création
// ---------------------------------------------------------------------------
describe("savePendingRecipe — complétion", () => {
  it("déclenche la complétion description/tags après l'insertion (création)", async () => {
    installSupabase({
      resultsByTable: { recipes: { data: { id: "new-1" }, error: null } },
    });
    const { result } = renderHook(() => useHomeChat());

    await sendToolCall(result, "save_recipe", PENDING_RECIPE);
    await act(() => result.current.savePendingRecipe());

    await waitFor(() => expect(triggerRecipeCompletion).toHaveBeenCalled());
    expect(triggerRecipeCompletion).toHaveBeenCalledWith(
      "new-1",
      expect.objectContaining({ title: PENDING_RECIPE.title }),
      expect.any(Function),
    );
  });

  it("ne déclenche pas la complétion en mise à jour", async () => {
    installSupabase({
      resultsByTable: { recipes: { data: { id: "r1" }, error: null } },
    });
    const { result } = renderHook(() => useHomeChat());

    await sendToolCall(result, "save_recipe", {
      ...PENDING_RECIPE,
      isUpdate: true,
      originalRecipeId: "r1",
    });
    await act(() => result.current.savePendingRecipe());

    expect(triggerRecipeCompletion).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Flow : édition d'une recette via le chat d'accueil
// ---------------------------------------------------------------------------
describe("useHomeChat — édition de recette", () => {
  it("savePendingRecipe met à jour la recette d'origine quand isUpdate et originalRecipeId sont présents", async () => {
    // Cas où l'assistant renvoie save_recipe avec les marqueurs d'update —
    // le moteur doit router vers UPDATE et non INSERT.
    const { result } = renderHook(() => useHomeChat());
    await sendToolCall(result, "save_recipe", {
      ...PENDING_RECIPE,
      isUpdate: true,
      originalRecipeId: "r1",
    });

    await act(() => result.current.savePendingRecipe());

    const [recipesBuilder] = buildersFor("recipes");
    expect(recipesBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Tarte Tatin", servings: 6 }),
    );
    expect(recipesBuilder.eq).toHaveBeenCalledWith("id", "r1");
    expect(recipesBuilder.insert).not.toHaveBeenCalled();
    expect(lastMessage(result.current.messages).content).toContain(
      '✅ J\'ai mis à jour ta recette "Tarte Tatin"',
    );
  });

  it("extract_modified_recipe sans recette active retombe sur une création (limitation du chat d'accueil)", async () => {
    // Dans le chat d'accueil, activeRecipe n'est jamais alimenté : le flag
    // isUpdate est posé mais originalRecipeId reste undefined, donc la
    // sauvegarde passe par l'INSERT. Ce test documente le comportement actuel.
    installSupabase({
      resultsByTable: { recipes: { data: { id: "new-2" }, error: null } },
    });
    const { result } = renderHook(() => useHomeChat());

    await sendToolCall(result, "extract_modified_recipe", PENDING_RECIPE);

    expect(result.current.pendingRecipe).toMatchObject({
      isUpdate: true,
      originalRecipeId: undefined,
    });

    await act(() => result.current.savePendingRecipe());

    const [recipesBuilder] = buildersFor("recipes");
    expect(recipesBuilder.insert).toHaveBeenCalled();
    expect(recipesBuilder.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Flow : mise à jour du profil culinaire
// ---------------------------------------------------------------------------
describe("useHomeChat — préférences utilisateur", () => {
  it("update_preferences applique add/remove/set puis persiste le profil", async () => {
    const { result } = renderHook(() => useHomeChat());

    await sendToolCall(result, "update_preferences", {
      operations: [
        { operation: "add", category: "dietary_constraints", field: "allergies", values: ["arachides"] },
        { operation: "remove", category: "taste_preferences", field: "liked_flavors", values: ["sucré"] },
        { operation: "set", category: "culinary_style", field: "preferred_difficulty", value: "facile" },
      ],
    });

    expect(mockUpdatePreferences).toHaveBeenCalledTimes(1);
    const updated = mockUpdatePreferences.mock.calls[0][0] as UserCulinaryPreferences;
    expect(updated.dietary_constraints.allergies).toEqual(["gluten", "arachides"]);
    expect(updated.taste_preferences.liked_flavors).toEqual([]);
    expect(updated.culinary_style.preferred_difficulty).toBe("facile");
  });

  it("update_preferences dédoublonne les valeurs ajoutées", async () => {
    const { result } = renderHook(() => useHomeChat());

    await sendToolCall(result, "update_preferences", {
      operations: [
        { operation: "add", category: "dietary_constraints", field: "allergies", values: ["gluten"] },
      ],
    });

    const updated = mockUpdatePreferences.mock.calls[0][0] as UserCulinaryPreferences;
    expect(updated.dietary_constraints.allergies).toEqual(["gluten"]);
  });

  it("ne persiste rien si les préférences ne sont pas chargées", async () => {
    hookState.preferences = null;
    const { result } = renderHook(() => useHomeChat());

    await sendToolCall(result, "update_preferences", {
      operations: [
        { operation: "add", category: "dietary_constraints", field: "allergies", values: ["soja"] },
      ],
    });

    expect(mockUpdatePreferences).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Flow : recherche de recettes
// ---------------------------------------------------------------------------
describe("useHomeChat — recherche", () => {
  it("search_recipes filtre par titre et affiche les résultats dans le chat", async () => {
    const { result } = renderHook(() => useHomeChat());

    await sendToolCall(result, "search_recipes", { query: "tarte" });

    const last = lastMessage(result.current.messages);
    expect(last.content).toContain("Tarte aux pommes");
    expect(last.content).not.toContain("Soupe à l'oignon");
  });

  it("search_recipes filtre par favoris uniquement", async () => {
    const { result } = renderHook(() => useHomeChat());

    await sendToolCall(result, "search_recipes", { query: "all", favorites_only: true });

    const last = lastMessage(result.current.messages);
    expect(last.content).toContain("Tarte aux pommes");
    expect(last.content).not.toContain("Soupe à l'oignon");
  });
});

// ---------------------------------------------------------------------------
// Flow : navigation
// ---------------------------------------------------------------------------
describe("useHomeChat — navigation", () => {
  it("navigate redirige vers la page demandée", async () => {
    const { result } = renderHook(() => useHomeChat());

    await sendToolCall(result, "navigate", { destination: "meal_planning" });

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/meal-planning"), {
      timeout: 1500,
    });
  });

  it("open_recipe ouvre la fiche de la recette", async () => {
    const { result } = renderHook(() => useHomeChat());

    await sendToolCall(result, "open_recipe", { recipe_id: "r1" });

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/recipes/r1"), {
      timeout: 1500,
    });
  });

  it("navigate ignore une destination inconnue", async () => {
    const { result } = renderHook(() => useHomeChat());

    await sendToolCall(result, "navigate", { destination: "nulle_part" });

    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Flow : planification de repas
// ---------------------------------------------------------------------------
describe("useHomeChat — planning de repas", () => {
  it("save_meal_plan remplace les repas de la semaine puis redirige vers le planning", async () => {
    const { result } = renderHook(() => useHomeChat());

    await sendToolCall(result, "save_meal_plan", {
      week_start: "2026-06-08",
      meals: [
        { day_of_week: 1, meal_type: "dinner", recipe_id: "r1" },
        { day_of_week: 2, meal_type: "lunch", custom_meal: "Restes", notes: "vider le frigo" },
      ],
    });

    const [deleteBuilder, insertBuilder] = buildersFor("meal_plans");
    expect(deleteBuilder.delete).toHaveBeenCalled();
    expect(deleteBuilder.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(deleteBuilder.eq).toHaveBeenCalledWith("week_start", "2026-06-08");

    expect(insertBuilder.insert).toHaveBeenCalledWith([
      {
        user_id: "u1",
        week_start: "2026-06-08",
        day_of_week: 1,
        meal_type: "dinner",
        recipe_id: "r1",
        custom_meal: null,
        notes: null,
      },
      {
        user_id: "u1",
        week_start: "2026-06-08",
        day_of_week: 2,
        meal_type: "lunch",
        recipe_id: null,
        custom_meal: "Restes",
        notes: "vider le frigo",
      },
    ]);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/meal-planning"), {
      timeout: 1500,
    });
  });
});
