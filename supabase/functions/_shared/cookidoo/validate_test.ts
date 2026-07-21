import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { validateCookidooPayload } from "./validate.ts";
import type { CookidooRecipePayload } from "./types.ts";

function base(overrides: Partial<CookidooRecipePayload> = {}): CookidooRecipePayload {
  return {
    name: "Test",
    image: null,
    isImageOwnedByUser: false,
    tools: ["TM7"],
    yield: { value: 4, unitText: "portion" },
    prepTime: 0,
    cookTime: 0,
    totalTime: 0,
    ingredients: [{ type: "INGREDIENT", text: "200 g de farine" }],
    instructions: [{ type: "STEP", text: "Mélanger.", annotations: [] }],
    hints: "",
    workStatus: "PRIVATE",
    recipeMetadata: { requiresAnnotationsCheck: false },
    ...overrides,
  };
}

Deno.test("validateCookidooPayload: payload complet → ok", () => {
  assertEquals(validateCookidooPayload(base()).ok, true);
});

Deno.test("validateCookidooPayload: titre manquant → erreur", () => {
  const res = validateCookidooPayload(base({ name: "  " }));
  assertEquals(res.ok, false);
  assertEquals(res.errors.includes("titre manquant"), true);
});

Deno.test("validateCookidooPayload: sans ingrédient ni étape → erreurs", () => {
  const res = validateCookidooPayload(base({ ingredients: [], instructions: [] }));
  assertEquals(res.ok, false);
  assertEquals(res.errors.length, 2);
});
