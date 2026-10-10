import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { exportQualityNotes } from "./quality.ts";
import { mapRecipeToCookidoo } from "./mapper.ts";
import type { Recipe } from "./types.ts";

Deno.test("qualité : mélange sans réglages et mesure ambiguë sont signalés", () => {
  const recipe: Recipe = { title: "Bao", ingredients: [{ name: "huile", quantity: 2, unit: "cuillères" }], steps: [{ order: 1, text: "Mélanger l'huile." }] };
  assertEquals(exportQualityNotes(recipe, mapRecipeToCookidoo(recipe)).length, 2);
});

Deno.test("qualité : les actions explicitement manuelles ne déclenchent pas d'adaptation", () => {
  for (const text of ["Mélanger dans un saladier.", "Cuire au four 20 min à 180°C.", "Mélanger à la main."]) {
    const recipe: Recipe = { title: "Manuel", ingredients: [{ name: "farine", quantity: 200, unit: "g" }], steps: [{ order: 1, text }] };
    assertEquals(exportQualityNotes(recipe, mapRecipeToCookidoo(recipe)), []);
  }
});

Deno.test("qualité : étaler reste manuel et les cuillères non précisées dans l'étape sont signalées", () => {
  const recipe: Recipe = { title: "Huile", ingredients: [{ name: "huile d’olive", quantity: 40, unit: "g" }], steps: [{ order: 1, text: "Ajouter 2 cuillères d’huile." }] };
  assertEquals(exportQualityNotes(recipe, mapRecipeToCookidoo(recipe)).length, 1);
  for (const text of ["Étaler la pâte.", "Mixer puis étaler la pâte.", "Enfourner à 180 °C."]) {
    const manual = { ...recipe, steps: [{ order: 1, text }] };
    assertEquals(exportQualityNotes(manual, mapRecipeToCookidoo(manual)), []);
  }
});
