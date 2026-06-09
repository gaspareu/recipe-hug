import { renderHook, act } from "@testing-library/react";
import { vi } from "vitest";
import { createSupabaseMock } from "@/test/supabase-mock";
import { sseResponse, toolCallEvent, contentEvent } from "@/test/sse";
import type { Recipe } from "@/types/recipe";
import type { UserCulinaryPreferences } from "./useUserPreferences";

const { mockSupabase, mockUpdatePreferences, hookState } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockSupabase: { from: vi.fn(), auth: { getSession: vi.fn(), getUser: vi.fn() } } as any,
  mockUpdatePreferences: vi.fn(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hookState: { recipes: [] as any[], preferences: null as any },
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("./useRecipes", () => ({
  useRecipes: () => ({ data: hookState.recipes, refetch: vi.fn() }),
}));
vi.mock("./useUserPreferences", () => ({
  useUserPreferences: () => ({
    preferences: hookState.preferences,
    updatePreferences: mockUpdatePreferences,
  }),
}));

import { useRecipeChat, type ChatMessage } from "./useRecipeChat";

const SESSION = { access_token: "tok", user: { id: "u1" } };

const fetchMock = vi.fn();

function lastMessage(messages: ChatMessage[]): ChatMessage {
  return messages[messages.length - 1];
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

function setup(options: { completedSteps?: Set<number> } = {}) {
  const onRecipeUpdate = vi.fn().mockResolvedValue(undefined);
  const onRecipeCreate = vi.fn().mockResolvedValue(undefined);
  const hook = renderHook(() =>
    useRecipeChat({
      recipe: RECIPE,
      completedSteps: options.completedSteps ?? new Set<number>(),
      onRecipeUpdate,
      onRecipeCreate,
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
});

// ---------------------------------------------------------------------------
// Flow : modification de la recette en cours
// ---------------------------------------------------------------------------
describe("useRecipeChat — modification de la recette", () => {
  it("extract_modified_recipe prépare une mise à jour liée à la recette ouverte", async () => {
    const { result } = setup();

    await sendToolCall(result, "extract_modified_recipe", MODIFIED_RECIPE);

    expect(result.current.pendingRecipe).toMatchObject({
      title: "Tarte aux pommes et cannelle",
      isUpdate: true,
      originalRecipeId: "r1",
    });
  });

  it("savePendingRecipe délègue la mise à jour à onRecipeUpdate et confirme", async () => {
    const { result, onRecipeUpdate, onRecipeCreate } = setup();
    await sendToolCall(result, "extract_modified_recipe", MODIFIED_RECIPE);

    await act(() => result.current.savePendingRecipe());

    expect(onRecipeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Tarte aux pommes et cannelle",
        isUpdate: true,
        originalRecipeId: "r1",
      }),
    );
    expect(onRecipeCreate).not.toHaveBeenCalled();
    expect(result.current.pendingRecipe).toBeNull();
    expect(lastMessage(result.current.messages).content).toContain("mise à jour");
  });

  it("conserve la recette en attente si la mise à jour échoue", async () => {
    const { result, onRecipeUpdate } = setup();
    onRecipeUpdate.mockRejectedValue(new Error("réseau"));
    await sendToolCall(result, "extract_modified_recipe", MODIFIED_RECIPE);

    await act(() => result.current.savePendingRecipe());

    expect(result.current.pendingRecipe).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Flow : création d'une nouvelle recette depuis la recette ouverte
// ---------------------------------------------------------------------------
describe("useRecipeChat — création d'une variante", () => {
  it("create_new_recipe prépare une nouvelle recette avec sa relation à l'originale", async () => {
    const { result } = setup();

    await sendToolCall(result, "create_new_recipe", {
      ...MODIFIED_RECIPE,
      relation_to_original: "variante à la cannelle",
    });

    expect(result.current.pendingRecipe).toMatchObject({
      title: "Tarte aux pommes et cannelle",
      relationToOriginal: "variante à la cannelle",
    });
    expect(result.current.pendingRecipe!.isUpdate).toBeUndefined();
  });

  it("savePendingRecipe délègue la création à onRecipeCreate et confirme", async () => {
    const { result, onRecipeCreate, onRecipeUpdate } = setup();
    await sendToolCall(result, "create_new_recipe", MODIFIED_RECIPE);

    await act(() => result.current.savePendingRecipe());

    expect(onRecipeCreate).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Tarte aux pommes et cannelle" }),
    );
    expect(onRecipeUpdate).not.toHaveBeenCalled();
    expect(lastMessage(result.current.messages).content).toContain("créée");
  });

  it("save_recipe simple passe aussi par onRecipeCreate", async () => {
    const { result, onRecipeCreate } = setup();
    await sendToolCall(result, "save_recipe", MODIFIED_RECIPE);

    await act(() => result.current.savePendingRecipe());

    expect(onRecipeCreate).toHaveBeenCalled();
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

    const updated = mockUpdatePreferences.mock.calls[0][0] as UserCulinaryPreferences;
    expect(updated.kitchen_equipment.available).toEqual(["airfryer"]);
  });
});

// ---------------------------------------------------------------------------
// Annulation
// ---------------------------------------------------------------------------
describe("useRecipeChat — annulation", () => {
  it("cancelPendingRecipe abandonne la modification en attente", async () => {
    const { result } = setup();
    await sendToolCall(result, "extract_modified_recipe", MODIFIED_RECIPE);

    act(() => result.current.cancelPendingRecipe());

    expect(result.current.pendingRecipe).toBeNull();
    expect(lastMessage(result.current.messages).content).toContain("on continue la discussion");
  });
});
