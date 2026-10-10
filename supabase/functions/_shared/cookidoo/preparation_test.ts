import { assertEquals, assertThrows } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { applyPreparation, signPreparation, verifyPreparation } from "./preparation.ts";
import type { Recipe } from "./types.ts";

const source: Recipe = {
  title: "Pains Bao", servings: 4,
  ingredients: [{ name: "eau chaude", quantity: 80, unit: "ml" }, { name: "lait chaud", quantity: 120, unit: "ml" }],
  steps: [{ order: 1, text: "Mélanger 80 ml d'eau chaude avec 120 ml de lait chaud." }, { order: 2, text: "Laisser reposer 45 minutes." }],
};
const suggestions = () => ({ steps: [{ order: 1, tm7: { mode: "mix", seconds: 30, speed: "2" } }, { order: 2, tm7: null }], notes: [] });

Deno.test("préparation : ajoute les réglages sans perdre les quantités, étapes ni modifier la source", () => {
  const before = structuredClone(source);
  const result = applyPreparation(source, JSON.stringify(suggestions()));
  assertEquals(source, before);
  assertEquals(result.recipe.ingredients, source.ingredients);
  assertEquals(result.recipe.steps.length, 2);
  assertEquals(result.recipe.steps[0].text, `${source.steps[0].text}\nRéglages TM7 : 30 s / vitesse 2.`);
  assertEquals(result.recipe.steps[1], source.steps[1]);
});

Deno.test("préparation : refuse disparition d'étape, permutation et paramètres hors plage", () => {
  const missing = suggestions(); missing.steps.pop();
  assertThrows(() => applyPreparation(source, JSON.stringify(missing)));
  const reversed = suggestions(); reversed.steps.reverse();
  assertThrows(() => applyPreparation(source, JSON.stringify(reversed)));
  const invalid = suggestions(); invalid.steps[0].tm7!.speed = "100";
  assertThrows(() => applyPreparation(source, JSON.stringify(invalid)));
  assertThrows(() => applyPreparation(source, JSON.stringify({ ...suggestions(), ingredients: [] })));
});

Deno.test("préparation : conserve les réglages structurés déjà approuvés", () => {
  const structured: Recipe = { ...source, steps: [{ ...source.steps[0], tm7: { mode: "mix", seconds: 10, speed: "1" } }, source.steps[1]] };
  assertEquals(applyPreparation(structured, JSON.stringify(suggestions())).recipe.steps[0], structured.steps[0]);
});

Deno.test("aperçu signé : utilisateur, recette, révision, contenu et expiration liés", async () => {
  const binding = { userId: "owner", recipeId: "recipe", revision: "v1" };
  const candidate = applyPreparation(source, JSON.stringify(suggestions()));
  const signed = await signPreparation(candidate, binding, "test-secret", 1000);
  assertEquals(await verifyPreparation(signed, binding, "test-secret", 2000), signed);
  assertEquals(await verifyPreparation(signed, { ...binding, userId: "other" }, "test-secret", 2000), null);
  assertEquals(await verifyPreparation(signed, { ...binding, recipeId: "other" }, "test-secret", 2000), null);
  assertEquals(await verifyPreparation(signed, { ...binding, revision: "v2" }, "test-secret", 2000), null);
  const forged = structuredClone(signed); forged.recipe.ingredients[0].quantity = 500;
  assertEquals(await verifyPreparation(forged, binding, "test-secret", 2000), null);
  const alteredNotes = { ...signed, notes: ["Tout est vérifié"] };
  assertEquals(await verifyPreparation(alteredNotes, binding, "test-secret", 2000), null);
  assertEquals(await verifyPreparation(signed, binding, "test-secret", signed.expires_at + 1), null);
});

Deno.test("préparation : bloque côté serveur les propositions sur four, saladier et vapeur sans eau validée", () => {
  for (const text of ["Mélanger dans un saladier.", "Cuire au four 180°C.", "Laisser reposer 45 minutes.", "Façonner les pains.", "Cuire à la vapeur 10 minutes."]) {
    const recipe: Recipe = { ...source, steps: [{ order: 1, text }] };
    const tm7 = text.includes("vapeur") ? { mode: "steam", seconds: 600, speed: "1", temperature: "Varoma" } : { mode: "mix", seconds: 30, speed: "2" };
    const result = applyPreparation(recipe, JSON.stringify({ steps: [{ order: 1, tm7 }], notes: [] }));
    assertEquals(result.recipe.steps[0], recipe.steps[0]);
    assertEquals(result.notes.length, 1);
  }
});

Deno.test("source export : refuse les données JSON malformées et les ordres dupliqués", async () => {
  const { ExportSourceSchema } = await import("./preparation.ts");
  assertEquals(ExportSourceSchema.safeParse(source).success, true);
  for (const invalid of [{ ...source, ingredients: null }, { ...source, ingredients: [{ name: "huile", quantity: -2, unit: "g" }] }, { ...source, steps: [source.steps[0], source.steps[0]] }]) {
    assertEquals(ExportSourceSchema.safeParse(invalid).success, false);
  }
});

Deno.test("préparation : conserve les réglages textuels legacy même si une autre étape manque de commandes", () => {
  const recipe: Recipe = { ...source, steps: [{ order: 1, text: "Mixer 10 s/vitesse 5." }, { order: 2, text: "Mélanger le lait." }] };
  const result = applyPreparation(recipe, JSON.stringify({ steps: [{ order: 1, tm7: { mode: "mix", seconds: 30, speed: "2" } }, { order: 2, tm7: { mode: "mix", seconds: 20, speed: "1" } }], notes: [] }));
  assertEquals(result.recipe.steps[0], recipe.steps[0]);
  assertEquals(result.recipe.steps[1].tm7?.seconds, 20);
});
