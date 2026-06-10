import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  formatIngredient,
  mapRecipeToCookidoo,
  parseStepAnnotations,
} from "./mapper.ts";
import type { Recipe } from "./types.ts";

Deno.test("formatIngredient: quantité + unité + nom", () => {
  assertEquals(
    formatIngredient({ name: "farine", quantity: 200, unit: "g" }),
    "200 g farine",
  );
});

Deno.test("formatIngredient: quantité absente reste propre", () => {
  assertEquals(
    formatIngredient({ name: "sel", quantity: null, unit: "" }),
    "sel",
  );
});

Deno.test("parseStepAnnotations: TTS temps/vitesse/température", () => {
  const ann = parseStepAnnotations("Mixer 8 min/100°C/vitesse 2.");
  assertEquals(ann.length, 1);
  assertEquals(ann[0].type, "TTS");
  assertEquals(ann[0].data.time, 480);
  assertEquals(ann[0].data.speed, "2");
  assertEquals(ann[0].data.temperature, { value: "100", unit: "C" });
});

Deno.test("parseStepAnnotations: Varoma → MODE STEAMING", () => {
  const ann = parseStepAnnotations("Cuire 15 min/Varoma/vitesse 1.");
  assertEquals(ann.length, 1);
  assertEquals(ann[0].type, "MODE");
  assertEquals(ann[0].name, "STEAMING");
  assertEquals(ann[0].data.accessory, "Varoma");
});

Deno.test("parseStepAnnotations: texte simple → aucune annotation", () => {
  assertEquals(parseStepAnnotations("Réserver au frais."), []);
});

Deno.test("mapRecipeToCookidoo: structure complète + tri des étapes", () => {
  const recipe: Recipe = {
    title: "  Soupe  ",
    servings: 6,
    ingredients: [
      { name: "carottes", quantity: 500, unit: "g" },
      { name: "eau", quantity: 1, unit: "L" },
    ],
    steps: [
      { order: 2, text: "Mixer 1 min/vitesse 8.", duration_minutes: 1 },
      { order: 1, text: "Éplucher les carottes.", duration_minutes: 5 },
    ],
  };

  const payload = mapRecipeToCookidoo(recipe, { tools: ["TM6"] });

  assertEquals(payload.name, "Soupe");
  assertEquals(payload.tools, ["TM6"]);
  assertEquals(payload.yield, { value: 6, unitText: "portion" });
  assertEquals(payload.ingredients.length, 2);
  assertEquals(payload.ingredients[0], { type: "INGREDIENT", text: "500 g carottes" });
  // Étapes triées par order
  assertEquals(payload.instructions[0].text, "Éplucher les carottes.");
  assertEquals(payload.instructions[1].text, "Mixer 1 min/vitesse 8.");
  // totalTime = somme des durées (min) en secondes
  assertEquals(payload.totalTime, 360);
  assertEquals(payload.workStatus, "PRIVATE");
});

Deno.test("mapRecipeToCookidoo: défauts (TM7, 4 portions) si non précisés", () => {
  const payload = mapRecipeToCookidoo({
    title: "Test",
    ingredients: [],
    steps: [],
  });
  assertEquals(payload.tools, ["TM7"]);
  assertEquals(payload.yield.value, 4);
});
