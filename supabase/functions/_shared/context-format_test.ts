import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  formatPreferencesContext,
  formatFavoritesContext,
  formatRecipeContext,
  type FavoriteRecipe,
} from "./context-format.ts";

// --- formatPreferencesContext ---
Deno.test("préférences : chaîne vide si null ou sans donnée", () => {
  assertEquals(formatPreferencesContext(null), "");
  assertEquals(formatPreferencesContext({}), "");
  assertEquals(formatPreferencesContext({ taste_preferences: { liked_flavors: [] } }), "");
});

Deno.test("préférences : inclut allergies et aliments particuliers, avec marqueurs", () => {
  const result = formatPreferencesContext({
    dietary_constraints: { allergies: ["arachides"] },
    taste_preferences: { special_ingredients: ["kombu", "citron confit"] },
  });
  assertStringIncludes(result, "ALLERGIES : arachides");
  assertStringIncludes(result, "Aliments particuliers : kombu, citron confit");
  assertStringIncludes(result, "--- PROFIL UTILISATEUR (USAGE SILENCIEUX) ---");
  assertStringIncludes(result, "--- FIN PROFIL ---");
});

// --- formatFavoritesContext ---
Deno.test("favoris : chaîne vide sans favori", () => {
  assertEquals(formatFavoritesContext(null), "");
  assertEquals(formatFavoritesContext([]), "");
});

Deno.test("favoris : formate le titre avec son résumé IA, encadré par les marqueurs", () => {
  const result = formatFavoritesContext([
    { id: "1", title: "Risotto aux cèpes", ai_summary: "Risotto crémeux aux cèpes et parmesan." },
  ]);
  assertStringIncludes(result, "1. Risotto aux cèpes — Risotto crémeux aux cèpes et parmesan.");
  assertStringIncludes(result, "--- RECETTES FAVORITES (échantillon, pour inspiration) ---");
  assertStringIncludes(result, "--- FIN FAVORITES ---");
});

Deno.test("favoris : se rabat sur le titre seul quand le résumé est absent ou vide", () => {
  const nullSummary = formatFavoritesContext([{ id: "1", title: "Pain maison", ai_summary: null }]);
  assertStringIncludes(nullSummary, "1. Pain maison");
  assert(!nullSummary.includes("Pain maison —"));

  const blankSummary = formatFavoritesContext([{ id: "2", title: "Tarte", ai_summary: "   " }]);
  assertStringIncludes(blankSummary, "1. Tarte");
  assert(!blankSummary.includes("Tarte —"));
});

Deno.test("favoris : limite l'échantillon à 5 même avec davantage de favoris", () => {
  const many: FavoriteRecipe[] = Array.from({ length: 8 }, (_, i) => ({
    id: String(i),
    title: `Recette ${i}`,
    ai_summary: null,
  }));
  const result = formatFavoritesContext(many);
  const numberedLines = result.match(/^\d+\. /gm) ?? [];
  assertEquals(numberedLines.length, 5);
});

// --- formatRecipeContext ---
Deno.test("recette active : chaîne vide sans recette", () => {
  assertEquals(formatRecipeContext(null), "");
});

Deno.test("recette active : formate titre, étapes et progression", () => {
  const result = formatRecipeContext({
    id: "r1",
    title: "Omelette",
    steps: [
      { order: 1, text: "Casser les œufs", completed: true },
      { order: 2, text: "Cuire" },
    ],
    completedSteps: [1],
  });
  assertStringIncludes(result, "Titre : Omelette");
  assertStringIncludes(result, "✓ 1. Casser les œufs");
  assertStringIncludes(result, "○ 2. Cuire");
  assertStringIncludes(result, "Progression : 1/2 étapes complétées");
});
