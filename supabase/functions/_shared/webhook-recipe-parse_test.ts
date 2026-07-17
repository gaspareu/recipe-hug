import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { parseWebhookRecipe, normalizeSteps } from "./webhook-recipe-parse.ts";

// Le contenu vient d'un LLM (via webhook-recipe, déclenché par ChatGPT/Raccourcis) :
// données externes non fiables → on nettoie, parse et normalise défensivement.

Deno.test("parseWebhookRecipe: recette valide conforme au schéma", () => {
  const res = parseWebhookRecipe(JSON.stringify({
    title: "Tarte Tatin",
    servings: 6,
    ingredients: [{ name: "Pomme", quantity: 6, unit: "pièce" }],
    steps: [{ order: 1, text: "Caraméliser" }],
    season: "automne",
    nutrition_tags: ["dessert"],
  }));
  assertEquals(res.ok, true);
  if (res.ok) {
    assertEquals(res.recipe.title, "Tarte Tatin");
    assertEquals(res.recipe.servings, 6);
    assertEquals(res.recipe.steps, [{ order: 1, text: "Caraméliser" }]);
  }
});

Deno.test("parseWebhookRecipe: tolère les clôtures markdown ```json", () => {
  const res = parseWebhookRecipe('```json\n{"title":"X","ingredients":[],"steps":[]}\n```');
  assertEquals(res.ok, true);
  if (res.ok) assertEquals(res.recipe.title, "X");
});

Deno.test("parseWebhookRecipe: JSON invalide → ok:false", () => {
  const res = parseWebhookRecipe("pas du json {");
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.error, "Failed to parse AI response");
});

Deno.test("parseWebhookRecipe: steps en chaînes → normalisées {order,text}", () => {
  const res = parseWebhookRecipe(JSON.stringify({
    title: "T", ingredients: [], steps: ["Étape une", "Étape deux"],
  }));
  assertEquals(res.ok, true);
  if (res.ok) {
    assertEquals(res.recipe.steps, [
      { order: 1, text: "Étape une" },
      { order: 2, text: "Étape deux" },
    ]);
  }
});

Deno.test("parseWebhookRecipe: schéma invalide (title manquant) → repli avec titre par défaut", () => {
  const res = parseWebhookRecipe(JSON.stringify({
    portions: 4, ingredients: [], steps: [],
  }));
  assertEquals(res.ok, true);
  if (res.ok) {
    assertEquals(res.recipe.title, "Recette sans titre");
    // servings repris de `portions`
    assertEquals(res.recipe.servings, 4);
  }
});

Deno.test("parseWebhookRecipe: repli — champs de mauvais type neutralisés", () => {
  const res = parseWebhookRecipe(JSON.stringify({
    title: "Sans titre valide", ingredients: "pas un tableau", steps: [], nutrition_tags: "pas un tableau",
  }));
  assertEquals(res.ok, true);
  if (res.ok) {
    assertEquals(res.recipe.ingredients, []);
    assertEquals(res.recipe.nutrition_tags, null);
  }
});

Deno.test("normalizeSteps: objet avec `instruction` sans `text` → mappé vers text", () => {
  assertEquals(
    normalizeSteps([{ instruction: "Mélanger" }]),
    [{ order: 1, text: "Mélanger" }],
  );
});

Deno.test("normalizeSteps: préserve l'ordre explicite", () => {
  assertEquals(
    normalizeSteps([{ order: 5, text: "Cuire" }]),
    [{ order: 5, text: "Cuire" }],
  );
});
