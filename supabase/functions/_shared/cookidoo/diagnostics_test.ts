import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { buildExportDiagnostics } from "./diagnostics.ts";
import type { CookidooRecipePayload, Recipe } from "./types.ts";

function payloadWith(
  instructions: CookidooRecipePayload["instructions"],
  image: string | null = null,
): CookidooRecipePayload {
  return {
    name: "Test",
    image,
    isImageOwnedByUser: false,
    tools: ["TM7"],
    yield: { value: 4, unitText: "portions" },
    prepTime: 0,
    cookTime: 0,
    totalTime: 0,
    ingredients: [{ type: "INGREDIENT", text: "200 g de farine" }],
    instructions,
    hints: "",
    workStatus: "PRIVATE",
    recipeMetadata: { requiresAnnotationsCheck: false },
  };
}

Deno.test("compte les étapes, les annotations et les ingrédients", () => {
  const recipe: Recipe = {
    title: "Test",
    servings: 4,
    ingredients: [{ name: "farine", quantity: 200, unit: "g" }],
    steps: [
      { order: 1, text: "Mixer", tm7: { mode: "mix", seconds: 30, speed: "5" } },
      { order: 2, text: "Verser" },
    ],
  };
  const payload = payloadWith([
    {
      type: "STEP",
      text: "Mixer 30 s / vitesse 5",
      annotations: [
        { type: "TTS", data: {}, position: { offset: 0, length: 5 } },
        { type: "INGREDIENT", data: {}, position: { offset: 0, length: 5 } },
      ],
    },
    { type: "STEP", text: "Verser", annotations: [] },
  ]);

  const diag = buildExportDiagnostics(recipe, payload);

  assertEquals(diag.steps_total, 2);
  assertEquals(diag.steps_with_tm7, 1);
  assertEquals(diag.steps_guided, 1);
  assertEquals(diag.annotations, { TTS: 1, INGREDIENT: 1 });
  assertEquals(diag.ingredients_count, 1);
  assertEquals(diag.tools, ["TM7"]);
});

Deno.test("une étape annotée uniquement INGREDIENT n'est pas guidée", () => {
  // C'est la distinction qui compte : une liaison d'ingrédient ne déclenche
  // aucun réglage machine sur le TM7, contrairement à TTS ou MODE.
  const recipe: Recipe = {
    title: "Test",
    ingredients: [],
    steps: [{ order: 1, text: "Ajouter la farine" }],
  };
  const payload = payloadWith([
    {
      type: "STEP",
      text: "Ajouter la farine",
      annotations: [{ type: "INGREDIENT", data: {}, position: { offset: 8, length: 9 } }],
    },
  ]);

  const diag = buildExportDiagnostics(recipe, payload);

  assertEquals(diag.steps_guided, 0);
  assertEquals(diag.annotations, { INGREDIENT: 1 });
});

Deno.test("signale l'absence d'image", () => {
  const recipe: Recipe = { title: "Test", ingredients: [], steps: [] };

  assertEquals(buildExportDiagnostics(recipe, payloadWith([], null)).has_image, false);
  assertEquals(buildExportDiagnostics(recipe, payloadWith([], "https://x/i.jpg")).has_image, true);
});

Deno.test("recette vide : tous les compteurs à zéro", () => {
  const recipe: Recipe = { title: "Vide", ingredients: [], steps: [] };
  const payload = payloadWith([]);
  payload.ingredients = [];

  const diag = buildExportDiagnostics(recipe, payload);

  assertEquals(diag.steps_total, 0);
  assertEquals(diag.steps_with_tm7, 0);
  assertEquals(diag.steps_guided, 0);
  assertEquals(diag.annotations, {});
  assertEquals(diag.ingredients_count, 0);
});
