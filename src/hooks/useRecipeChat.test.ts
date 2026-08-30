import { renderHook, act } from "@testing-library/react";
import { vi } from "vitest";
import { createSupabaseMock } from "@/test/supabase-mock";
import { sseResponse, toolCallEvent, contentEvent } from "@/test/sse";
import type { Recipe } from "@/types/recipe";
import type { UserCulinaryPreferences } from "./useUserPreferences";

const { mockSupabase, mockUpdatePreferencesAsync, mockNavigate, hookState } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockSupabase: { from: vi.fn(), auth: { getSession: vi.fn(), getUser: vi.fn() } } as any,
  mockUpdatePreferencesAsync: vi.fn((_prefs?: unknown) => Promise.resolve()),
  mockNavigate: vi.fn(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hookState: { recipes: [] as any[], preferences: null as any },
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }));
vi.mock("./useRecipes", () => ({
  useRecipes: () => ({ data: hookState.recipes, refetch: vi.fn() }),
}));
vi.mock("./useUserPreferences", () => ({
  useUserPreferences: () => ({
    preferences: hookState.preferences,
    updatePreferencesAsync: mockUpdatePreferencesAsync,
  }),
}));

import { useRecipeChat, type ChatMessage } from "./useRecipeChat";

const SESSION = { access_token: "tok", user: { id: "u1" } };

const fetchMock = vi.fn();

function lastMessage(messages: ChatMessage[]): ChatMessage {
  return messages[messages.length - 1];
}

function recipeCardMessage(messages: ChatMessage[]): ChatMessage {
  const message = messages.find(candidate => candidate.recipeCard);
  if (!message) throw new Error('Aucune carte recette dans le fil');
  return message;
}

const RECIPE: Recipe = {
  id: "r1",
  user_id: "u1",
  title: "Tarte aux pommes",
  status: "validated",
  is_favorite: true,
  servings: 4,
  ingredients: [{ name: "Pomme", quantity: 3, unit: "pièce" }],
  steps: [
    { order: 1, text: "Éplucher les pommes" },
    { order: 2, text: "Cuire 30 minutes" },
  ],
  season: "automne",
  nutrition_tags: null,
  calorie_score: null,
  ai_summary: null,
  source_type: "manual",
  source_image_url: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

const MODIFIED_RECIPE = {
  title: "Tarte aux pommes et cannelle",
  servings: 4,
  ingredients: [
    { name: "Pomme", quantity: 3, unit: "pièce" },
    { name: "Cannelle", quantity: 1, unit: "c. à café" },
  ],
  steps: [{ order: 1, text: "Éplucher et saupoudrer de cannelle" }],
};

function setup(options: { completedSteps?: Set<number>; onStartCooking?: (recipeId: string, servings?: number) => void } = {}) {
  const onRecipeUpdate = vi.fn().mockResolvedValue(undefined);
  const onRecipeCreate = vi.fn().mockResolvedValue('r-new');
  const hook = renderHook(() =>
    useRecipeChat({
      recipe: RECIPE,
      completedSteps: options.completedSteps ?? new Set<number>(),
      onRecipeUpdate,
      onRecipeCreate,
      onStartCooking: options.onStartCooking,
    }),
  );
  return { ...hook, onRecipeUpdate, onRecipeCreate };
}

/** Envoie un message dont la réponse streamée contient un unique tool call. */
async function sendToolCall(
  result: { current: ReturnType<typeof useRecipeChat> },
  name: string,
  args: Record<string, unknown>,
) {
  fetchMock.mockResolvedValueOnce(sseResponse([toolCallEvent(name, args)]));
  await act(() => result.current.sendMessage("message de test"));
}

beforeEach(() => {
  vi.clearAllMocks();
  hookState.recipes = [RECIPE];
  hookState.preferences = null;
  Object.assign(mockSupabase, createSupabaseMock({ session: SESSION }));
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(sseResponse([contentEvent("Ok")]));
});

// ---------------------------------------------------------------------------
// Contexte initial
// ---------------------------------------------------------------------------
describe("useRecipeChat — contexte initial", () => {
  it("accueille avec le titre de la recette et la définit comme recette active", () => {
    const { result } = setup();
    expect(result.current.messages[0].content).toContain("Tarte aux pommes");
    expect(result.current.activeRecipe).toMatchObject({ id: "r1", title: "Tarte aux pommes" });
  });

  it("envoie la recette active avec les étapes complétées à l'edge function", async () => {
    const { result } = setup({ completedSteps: new Set([1, 2]) });

    await act(() => result.current.sendMessage("Où en suis-je ?"));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.activeRecipe).toMatchObject({ id: "r1", completedSteps: [1, 2] });
    expect(body.recipes).toEqual([
      { id: "r1", title: "Tarte aux pommes", status: "validated", is_favorite: true },
    ]);
  });

  it("resynchronise le contexte de Chef quand les portions changent", async () => {
    const scaledRecipe: Recipe = {
      ...RECIPE,
      servings: 6,
      ingredients: [{ name: "Pomme", quantity: 4.5, unit: "pièce" }],
    };
    const { result, rerender } = renderHook(
      ({ recipe }) => useRecipeChat({ recipe, completedSteps: new Set<number>() }),
      { initialProps: { recipe: RECIPE } },
    );

    rerender({ recipe: scaledRecipe });
    await act(() => result.current.sendMessage("Quelle quantité de pommes ?"));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.activeRecipe).toMatchObject({
      servings: 6,
      ingredients: [{ name: "Pomme", quantity: 4.5, unit: "pièce" }],
    });
  });

  it("conserve la session tout en acceptant la progression du mode cuisine", async () => {
    const { result } = setup();

    act(() => result.current.syncContext(
      { ...RECIPE, servings: 6 },
      new Set([1]),
    ));
    await act(() => result.current.sendMessage("Où en suis-je ?"));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.activeRecipe).toMatchObject({
      id: "r1",
      servings: 6,
      completedSteps: [1],
    });
  });
});

// ---------------------------------------------------------------------------
// Flow : modification de la recette en cours
// ---------------------------------------------------------------------------
describe("useRecipeChat — modification de la recette", () => {
  it("ignore un identifiant de mise à jour qui ne vient pas des recettes chargées", async () => {
    const { result } = setup();
    await sendToolCall(result, "save_recipe", {
      ...MODIFIED_RECIPE,
      isUpdate: true,
      originalRecipeId: "../../profile",
    });

    expect(result.current.messages.some(message => message.recipeCard)).toBe(false);
  });

  it("extract_modified_recipe affiche une carte de mise à jour dans le fil", async () => {
    const { result } = setup();

    await sendToolCall(result, "extract_modified_recipe", MODIFIED_RECIPE);

    expect(recipeCardMessage(result.current.messages).recipeCard).toMatchObject({
      status: 'proposed',
      title: "Tarte aux pommes et cannelle",
      isUpdate: true,
    });
  });

  it("createProposedRecipe met à jour la recette et confirme la carte inline", async () => {
    const { result, onRecipeUpdate, onRecipeCreate } = setup();
    await sendToolCall(result, "extract_modified_recipe", MODIFIED_RECIPE);
    const messageId = recipeCardMessage(result.current.messages).id;

    await act(() => result.current.createProposedRecipe(messageId, {
      servings: 6,
      ingredients: MODIFIED_RECIPE.ingredients,
    }));

    expect(onRecipeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Tarte aux pommes et cannelle",
        servings: 6,
        isUpdate: true,
        originalRecipeId: "r1",
      }),
    );
    expect(onRecipeCreate).not.toHaveBeenCalled();
    expect(recipeCardMessage(result.current.messages).recipeCard).toMatchObject({
      status: 'saved',
      id: 'r1',
      servings: 6,
    });
  });

  it("conserve la carte proposée et affiche une erreur si la mise à jour échoue", async () => {
    const { result, onRecipeUpdate } = setup();
    onRecipeUpdate.mockRejectedValue(new Error("réseau"));
    await sendToolCall(result, "extract_modified_recipe", MODIFIED_RECIPE);
    const messageId = recipeCardMessage(result.current.messages).id;

    await act(() => result.current.createProposedRecipe(messageId, {
      servings: MODIFIED_RECIPE.servings,
      ingredients: MODIFIED_RECIPE.ingredients,
    }));

    expect(recipeCardMessage(result.current.messages).recipeCard?.status).toBe('proposed');
    expect(lastMessage(result.current.messages).content).toContain("pas pu enregistrer");
  });
});

// ---------------------------------------------------------------------------
// Flow : création d'une nouvelle recette depuis la recette ouverte
// ---------------------------------------------------------------------------
describe("useRecipeChat — création d'une variante", () => {
  it("propose_recipe affiche la même carte inline que sur la Home", async () => {
    const { result } = setup();
    await sendToolCall(result, "propose_recipe", MODIFIED_RECIPE);

    expect(recipeCardMessage(result.current.messages).recipeCard).toMatchObject({
      status: 'proposed',
      title: 'Tarte aux pommes et cannelle',
      isUpdate: false,
    });
  });

  it("create_new_recipe conserve la relation à l'originale jusqu'à la création", async () => {
    const { result, onRecipeCreate } = setup();

    await sendToolCall(result, "create_new_recipe", {
      ...MODIFIED_RECIPE,
      relation_to_original: "variante à la cannelle",
    });
    const message = recipeCardMessage(result.current.messages);

    expect(message.recipeCard).toMatchObject({
      status: 'proposed',
      title: "Tarte aux pommes et cannelle",
      isUpdate: false,
    });
    await act(() => result.current.createProposedRecipe(message.id, {
      servings: MODIFIED_RECIPE.servings,
      ingredients: MODIFIED_RECIPE.ingredients,
    }));
    expect(onRecipeCreate).toHaveBeenCalledWith(expect.objectContaining({
      relationToOriginal: "variante à la cannelle",
    }));
  });

  it("createProposedRecipe délègue la création et confirme la carte inline", async () => {
    const { result, onRecipeCreate, onRecipeUpdate } = setup();
    await sendToolCall(result, "create_new_recipe", MODIFIED_RECIPE);
    const messageId = recipeCardMessage(result.current.messages).id;

    await act(() => result.current.createProposedRecipe(messageId, {
      servings: MODIFIED_RECIPE.servings,
      ingredients: MODIFIED_RECIPE.ingredients,
    }));

    expect(onRecipeCreate).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Tarte aux pommes et cannelle" }),
    );
    expect(onRecipeUpdate).not.toHaveBeenCalled();
    expect(recipeCardMessage(result.current.messages).recipeCard).toMatchObject({
      status: 'saved',
      id: 'r-new',
    });
  });

  it("save_recipe simple passe aussi par onRecipeCreate", async () => {
    const { result, onRecipeCreate } = setup();
    await sendToolCall(result, "save_recipe", MODIFIED_RECIPE);
    const messageId = recipeCardMessage(result.current.messages).id;

    await act(() => result.current.createProposedRecipe(messageId, {
      servings: MODIFIED_RECIPE.servings,
      ingredients: MODIFIED_RECIPE.ingredients,
    }));

    expect(onRecipeCreate).toHaveBeenCalled();
  });
});

describe("useRecipeChat — navigation", () => {
  it("start_cooking ouvre le mode cuisine avec les portions demandées", async () => {
    const onStartCooking = vi.fn();
    const { result } = setup({ onStartCooking });

    await sendToolCall(result, "start_cooking", { recipe_id: "r1", servings: 6 });

    expect(onStartCooking).toHaveBeenCalledWith("r1", 6);
  });

  it("open_recipe et navigate utilisent uniquement les routes attendues", async () => {
    vi.useFakeTimers();
    try {
      const { result } = setup();
      await sendToolCall(result, "open_recipe", { recipe_id: "r1", recipe_title: "Tarte aux pommes" });
      await sendToolCall(result, "open_recipe", { recipe_id: "../../profile", recipe_title: "Piège" });
      await sendToolCall(result, "navigate", { destination: "meal_planning" });
      await sendToolCall(result, "navigate", { destination: "destination_inconnue" });

      act(() => vi.advanceTimersByTime(500));
      expect(mockNavigate).toHaveBeenCalledWith("/recipes/r1");
      expect(mockNavigate).toHaveBeenCalledWith("/meal-planning");
      expect(mockNavigate).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// Flow : préférences depuis l'assistant de cuisson
// ---------------------------------------------------------------------------
describe("useRecipeChat — préférences", () => {
  it("update_preferences persiste le profil modifié", async () => {
    hookState.preferences = {
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
    } satisfies UserCulinaryPreferences;
    const { result } = setup();

    await sendToolCall(result, "update_preferences", {
      operations: [
        { operation: "add", category: "kitchen_equipment", field: "available", values: ["airfryer"] },
      ],
    });

    const updated = mockUpdatePreferencesAsync.mock.calls[0][0] as UserCulinaryPreferences;
    expect(updated.kitchen_equipment.available).toEqual(["airfryer"]);
  });
});
