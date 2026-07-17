import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  formatIngredient,
  mapRecipeToCookidoo,
  parseStepAnnotations,
} from "./mapper.ts";
import type { Recipe } from "./types.ts";

// ── formatIngredient ─────────────────────────────────────────────────────────

Deno.test("formatIngredient: unité de mesure → « de »", () => {
  assertEquals(formatIngredient({ name: "farine", quantity: 200, unit: "g" }), "200 g de farine");
});

Deno.test("formatIngredient: élision « d' » devant voyelle/h", () => {
  assertEquals(formatIngredient({ name: "eau", quantity: 1, unit: "L" }), "1 L d'eau");
  assertEquals(formatIngredient({ name: "huile", quantity: 2, unit: "c. à soupe" }), "2 c. à soupe d'huile");
});

Deno.test("formatIngredient: pièce / sans unité → quantité + nom", () => {
  assertEquals(formatIngredient({ name: "œufs", quantity: 2, unit: "pièce" }), "2 œufs");
  assertEquals(formatIngredient({ name: "sel", quantity: null, unit: "" }), "sel");
});

Deno.test("formatIngredient: préparation ajoutée en suffixe", () => {
  assertEquals(
    formatIngredient({ name: "carottes", quantity: 200, unit: "g", preparation: "en dés" }),
    "200 g de carottes, en dés",
  );
});

// ── parseStepAnnotations (fallback texte libre) ──────────────────────────────

Deno.test("parseStepAnnotations: TTS temps/vitesse/température", () => {
  const ann = parseStepAnnotations("Mixer 8 min/100°C/vitesse 2.");
  assertEquals(ann.length, 1);
  assertEquals(ann[0].type, "TTS");
  assertEquals(ann[0].data.time, 480);
  assertEquals(ann[0].data.speed, "2");
  assertEquals(ann[0].data.temperature, { value: "100", unit: "C" });
});

Deno.test("parseStepAnnotations: Varoma → TTS avec temperature varoma", () => {
  const ann = parseStepAnnotations("Cuire 15 min/Varoma/vitesse 1.");
  assertEquals(ann.length, 1);
  assertEquals(ann[0].data.temperature, { value: "varoma" });
  assertEquals(ann[0].data.time, 900);
  assertEquals(ann[0].data.speed, "1");
});

Deno.test("parseStepAnnotations: texte simple → aucune annotation", () => {
  assertEquals(parseStepAnnotations("Réserver au frais."), []);
});

// ── Annotations structurées TM7 ──────────────────────────────────────────────

Deno.test("mapRecipeToCookidoo: étape tm7 → annotation TTS structurée", () => {
  const payload = mapRecipeToCookidoo({
    title: "Test",
    servings: 2,
    ingredients: [{ name: "farine", quantity: 200, unit: "g" }],
    steps: [
      { order: 1, text: "Cuire le mélange.", tm7: { mode: "cook", seconds: 480, temperature: 100, speed: "2" } },
    ],
  });
  const tts = payload.instructions[0].annotations.find((a) => a.type === "TTS")!;
  assertEquals(tts.data.time, 480);
  assertEquals(tts.data.speed, "2");
  assertEquals(tts.data.temperature, { value: "100", unit: "C" });
});

Deno.test("mapRecipeToCookidoo: tm7 mode steam → Varoma + sens inverse", () => {
  const payload = mapRecipeToCookidoo({
    title: "Vapeur",
    ingredients: [],
    steps: [
      { order: 1, text: "Cuire au Varoma.", tm7: { mode: "steam", seconds: 900, speed: "1", reverse: true } },
    ],
  });
  const tts = payload.instructions[0].annotations.find((a) => a.type === "TTS")!;
  assertEquals(tts.data.temperature, { value: "varoma" });
  assertEquals(tts.data.time, 900);
  assertEquals(tts.data.reverse, true);
});

Deno.test("mapRecipeToCookidoo: vitesse hors plage omise (dégradation propre)", () => {
  const payload = mapRecipeToCookidoo({
    title: "Test",
    ingredients: [],
    steps: [{ order: 1, text: "Mixer.", tm7: { mode: "chop", seconds: 10, speed: "25" } }],
  });
  const tts = payload.instructions[0].annotations.find((a) => a.type === "TTS")!;
  assertEquals(tts.data.time, 10);
  assertEquals(tts.data.speed, undefined); // "25" invalide → omis
});

// ── Annotations INGREDIENT ───────────────────────────────────────────────────

Deno.test("mapRecipeToCookidoo: annotations INGREDIENT (liaison texte)", () => {
  const text = "Ajouter les carottes dans le bol.";
  const payload = mapRecipeToCookidoo({
    title: "Test",
    ingredients: [{ name: "carottes", quantity: 500, unit: "g" }],
    steps: [{ order: 1, text }],
  });
  const ing = payload.instructions[0].annotations.find((a) => a.type === "INGREDIENT")!;
  assertEquals(ing.data.description, "500 g de carottes");
  assertEquals(text.substr(ing.position.offset, ing.position.length), "carottes");
});

Deno.test("mapRecipeToCookidoo: pas de faux positif d'ingrédient en milieu de mot", () => {
  // « ail » ne doit pas être annoté dans « travail »
  const payload = mapRecipeToCookidoo({
    title: "Test",
    ingredients: [{ name: "ail", quantity: 1, unit: "pièce" }],
    steps: [{ order: 1, text: "Un peu de travail de découpe." }],
  });
  assertEquals(payload.instructions[0].annotations.filter((a) => a.type === "INGREDIENT").length, 0);
});

// ── Temps (prépa / cuisson / total) ──────────────────────────────────────────

Deno.test("mapRecipeToCookidoo: prepTime (manuel) + cookTime (machine) + total", () => {
  const payload = mapRecipeToCookidoo({
    title: "Test",
    ingredients: [],
    steps: [
      { order: 1, text: "Laisser reposer.", duration_minutes: 30 },
      { order: 2, text: "Cuire.", tm7: { mode: "cook", seconds: 600, temperature: 100, speed: "1" } },
    ],
  });
  assertEquals(payload.prepTime, 1800);
  assertEquals(payload.cookTime, 600);
  assertEquals(payload.totalTime, 2400);
});

// ── requiresAnnotationsCheck ─────────────────────────────────────────────────

Deno.test("mapRecipeToCookidoo: requiresAnnotationsCheck reflète la présence d'annotations", () => {
  const withAnn = mapRecipeToCookidoo({
    title: "A",
    ingredients: [],
    steps: [{ order: 1, text: "Mixer 8 min/vitesse 2." }],
  });
  assertEquals(withAnn.recipeMetadata.requiresAnnotationsCheck, true);

  const noAnn = mapRecipeToCookidoo({
    title: "B",
    ingredients: [],
    steps: [{ order: 1, text: "Réserver au frais." }],
  });
  assertEquals(noAnn.recipeMetadata.requiresAnnotationsCheck, false);
});

// ── Structure complète + non-régression texte libre ──────────────────────────

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

  const payload = mapRecipeToCookidoo(recipe, { tools: ["TM7"] });

  assertEquals(payload.name, "Soupe");
  assertEquals(payload.tools, ["TM7"]);
  assertEquals(payload.yield, { value: 6, unitText: "portion" });
  assertEquals(payload.ingredients.length, 2);
  assertEquals(payload.ingredients[0], { type: "INGREDIENT", text: "500 g de carottes" });
  // Étapes triées par order
  assertEquals(payload.instructions[0].text, "Éplucher les carottes.");
  assertEquals(payload.instructions[1].text, "Mixer 1 min/vitesse 8.");
  assertEquals(payload.workStatus, "PRIVATE");
});

Deno.test("mapRecipeToCookidoo: recette legacy (texte libre) reste exportable", () => {
  const payload = mapRecipeToCookidoo({
    title: "Legacy",
    ingredients: [{ name: "sucre", quantity: 100, unit: "g" }],
    steps: [{ order: 1, text: "Mixer 8 min/100°C/vitesse 2." }],
  });
  const tts = payload.instructions[0].annotations.find((a) => a.type === "TTS")!;
  assertEquals(tts.data.time, 480);
  assertEquals(tts.data.speed, "2");
  assertEquals(payload.instructions.length, 1);
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

Deno.test("mapRecipeToCookidoo: image transmise via imageUrl", () => {
  const base: Recipe = { title: "Test", ingredients: [], steps: [] };
  const withImg = mapRecipeToCookidoo(base, { imageUrl: "https://cdn.example/img.png" });
  assertEquals(withImg.image, "https://cdn.example/img.png");
  assertEquals(withImg.isImageOwnedByUser, true);

  const noImg = mapRecipeToCookidoo(base);
  assertEquals(noImg.image, null);
  assertEquals(noImg.isImageOwnedByUser, false);
});
