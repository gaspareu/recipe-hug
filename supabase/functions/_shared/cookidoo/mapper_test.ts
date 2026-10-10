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

Deno.test("formatIngredient : unités longues conservées et reconnues, mesure ambiguë non inventée", () => {
  assertEquals(formatIngredient({ name: "huile d'olive", quantity: 2, unit: "cuillères à soupe" }), "2 c. à soupe d'huile d'olive");
  assertEquals(formatIngredient({ name: "levure chimique", quantity: 2, unit: "cuillères à café" }), "2 c. à café de levure chimique");
  assertEquals(formatIngredient({ name: "sucre", quantity: 4, unit: "cuillères" }), "4 cuillères sucre");
});

Deno.test("annotations ingrédients : alias unique huile et portions par étape sans répéter le total", () => {
  const payload = mapRecipeToCookidoo({ title: "Test", ingredients: [{ name: "huile d'olive", quantity: 40, unit: "g" }], steps: [{ order: 1, text: "Ajouter 10 g d'huile." }, { order: 2, text: "Ajouter 30 g d'huile." }] });
  assertEquals(payload.instructions.map((s) => s.annotations[0].data.description), ["10 g d'huile", "30 g d'huile"]);
  assertEquals(payload.instructions[0].annotations[0].position, { offset: 8, length: 12 });
});

Deno.test("annotations ingrédients : alias ambigu non deviné et plage conservée comme texte", () => {
  const payload = mapRecipeToCookidoo({ title: "Test", ingredients: [{ name: "huile d'olive", quantity: 20, unit: "g" }, { name: "huile de sésame", quantity: 10, unit: "g" }, { name: "farine", quantity: 315, unit: "g" }], steps: [{ order: 1, text: "Ajouter l'huile et entre 315 et 350g de farine." }] });
  assertEquals(payload.instructions[0].annotations.map((a) => a.data.description), ["farine"]);
});

Deno.test("repli texte : mijotage, virgule décimale et sens inverse sont normalisés", () => {
  assertEquals(parseStepAnnotations("Cuire 10 min/100°C/vitesse mijotage, sens inverse.")[0].data.speed, "soft");
  assertEquals(parseStepAnnotations("Cuire 10 min/100°C/vitesse mijotage, sens inverse.")[0].data.direction, "CCW");
  assertEquals(parseStepAnnotations("Mixer 10 s/vitesse 2,5.")[0].data.speed, "2.5");
});

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

Deno.test("mapRecipeToCookidoo: seconde pousse et préchauffage restent du texte", () => {
  const text = "Couvrir d'un linge et laisser gonfler 45 min à 1 h. Préchauffer le four à 180°C pendant ce temps.";
  const payload = mapRecipeToCookidoo({
    title: "Buns briochés moelleux pour burgers",
    ingredients: [],
    steps: [{ order: 9, text, duration_minutes: 50 }],
  });
  assertEquals(payload.instructions[0].text, text);
  assertEquals(payload.instructions[0].annotations, []);
});

Deno.test("parseStepAnnotations: le four ne devient pas un réglage machine, même à 100°C", () => {
  for (const text of [
    "Préchauffer le four à 180°C.",
    "Cuire au four 20 min à 100°C.",
    "Cuire 20 min à 100°C dans le four.",
  ]) assertEquals(parseStepAnnotations(text), []);
});

Deno.test("parseStepAnnotations: phrases four et TM7 séparées, offsets conservés", () => {
  for (const text of [
    "Préchauffer le four à 180°C. Mixer 8 min/100°C/vitesse 2.",
    "Mixer 8 min/100°C/vitesse 2. Préchauffer le four à 180°C.",
    "Préchauffer le four à 180°C ; mixer 8 min/100°C/vitesse 2.",
  ]) {
    const ann = parseStepAnnotations(text);
    assertEquals(ann.length, 1);
    assertEquals(ann[0].data, { time: 480, speed: "2", temperature: { value: "100", unit: "C" } });
    assertEquals(text.slice(ann[0].position.offset, ann[0].position.offset + ann[0].position.length), "8 min/100°C/vitesse 2");
  }
});

Deno.test("parseStepAnnotations: une durée de repos seule ne suffit pas à identifier le TM7", () => {
  assertEquals(parseStepAnnotations("Laisser gonfler 45 min."), []);
});

Deno.test("parseStepAnnotations: abréviation, vitesse décimale et minuterie TM7 préservées", () => {
  const ann = parseStepAnnotations("Mixer 8 min/100°C/vit. 2.5.");
  assertEquals(ann[0].data, { time: 480, speed: "2.5", temperature: { value: "100", unit: "C" } });
  assertEquals(parseStepAnnotations("Régler la minuterie du TM7 sur 3 min.")[0].data, { time: 180 });
});

Deno.test("mapRecipeToCookidoo: consigne de four conservée avec ses liens ingrédients", () => {
  const text = "Cuire les carottes au four 20 min à 100°C.";
  const payload = mapRecipeToCookidoo({
    title: "Carottes",
    ingredients: [{ name: "carottes", quantity: 500, unit: "g" }],
    steps: [{ order: 1, text }],
  });
  assertEquals(payload.instructions[0].text, text);
  assertEquals(payload.instructions[0].annotations.map((a) => a.type), ["INGREDIENT"]);
});

Deno.test("parseStepAnnotations: température hors plage omise sans la remplacer par 160°C", () => {
  const ann = parseStepAnnotations("Cuire 8 min/180°C/vitesse 2.");
  assertEquals(ann[0].data, { time: 480, speed: "2" });
  assertEquals(parseStepAnnotations("TM7 : 180°C."), []);
});

Deno.test("mapRecipeToCookidoo: paramètres structurés prioritaires avec une consigne de four", () => {
  const payload = mapRecipeToCookidoo({
    title: "Test",
    ingredients: [],
    steps: [{ order: 1, text: "Préchauffer le four à 180°C. Chauffer 3 min/37°C/vitesse 1.",
      tm7: { mode: "cook", seconds: 180, temperature: 37, speed: "1" } }],
  });
  assertEquals(payload.instructions[0].annotations[0].data.temperature, { value: "37", unit: "C" });
});

Deno.test("mapRecipeToCookidoo: pétrissage structuré sans chevauchement de l'ingrédient", () => {
  const text = "Ajouter la farine et pétrir 3 min.";
  const payload = mapRecipeToCookidoo({
    title: "Pâte",
    ingredients: [{ name: "farine", quantity: 200, unit: "g" }],
    steps: [{ order: 1, text, tm7: { mode: "knead", seconds: 180 } }],
  });
  const [machine, ingredient] = payload.instructions[0].annotations;
  assertEquals(machine.type, "MODE");
  assertEquals(machine.position, { offset: text.indexOf("3 min"), length: 5 });
  assertEquals(ingredient.type, "INGREDIENT");
  assertEquals(ingredient.position.offset + ingredient.position.length <= machine.position.offset, true);
});

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
  assertEquals(tts.data.direction, "CCW");
});

Deno.test("mapRecipeToCookidoo: TTS structuré positionné sur le segment de paramètres", () => {
  const text = "Ajouter les carottes, cuire 20 min/100°C/vitesse 1.";
  const payload = mapRecipeToCookidoo({
    title: "T",
    ingredients: [{ name: "carottes", quantity: 500, unit: "g" }],
    steps: [{ order: 1, text, tm7: { mode: "cook", seconds: 1200, temperature: 100, speed: "1" } }],
  });
  const anns = payload.instructions[0].annotations;
  const tts = anns.find((a) => a.type === "TTS")!;
  const ing = anns.find((a) => a.type === "INGREDIENT")!;

  // Le TTS couvre les seuls paramètres, pas toute la phrase…
  assertEquals(text.substr(tts.position.offset, tts.position.length), "20 min/100°C/vitesse 1");
  // …et ne chevauche donc pas l'annotation ingrédient.
  assertEquals(ing.position.offset + ing.position.length <= tts.position.offset, true);
});

Deno.test("mapRecipeToCookidoo: vitesse plafonnée en cuisson vapeur (contrainte TM7)", () => {
  const payload = mapRecipeToCookidoo({
    title: "T",
    ingredients: [],
    steps: [{ order: 1, text: "Cuire à la vapeur.", tm7: { mode: "steam", seconds: 900, speed: "8" } }],
  });
  const tts = payload.instructions[0].annotations.find((a) => a.type === "TTS")!;
  assertEquals(tts.data.speed, "5"); // TM7_STEAM_SPEED_MAX
  assertEquals(tts.data.temperature, { value: "varoma" });
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

Deno.test("mapRecipeToCookidoo: image jamais posée par le mapper (upload séparé)", () => {
  const p = mapRecipeToCookidoo({ title: "T", ingredients: [], steps: [] });
  assertEquals(p.image, null);
  assertEquals(p.isImageOwnedByUser, false);
});

// ── Conformité au contrat Cookidoo réel (inspection réseau) ──────────────────

Deno.test("tm7 reverse → TTS direction CCW (et pas reverse:true)", () => {
  const p = mapRecipeToCookidoo({
    title: "T",
    ingredients: [],
    steps: [{
      order: 1,
      text: "Cuire 15 min/100°C/vitesse mijotage.",
      tm7: { mode: "slow_cook", seconds: 900, temperature: 100, speed: "mijotage", reverse: true },
    }],
  });
  const a = p.instructions[0].annotations[0];
  assertEquals(a.type, "TTS");
  assertEquals(a.data.direction, "CCW");
  assertEquals(a.data.reverse, undefined);
  // « mijotage » s'écrit « soft » côté Cookidoo
  assertEquals(a.data.speed, "soft");
  assertEquals(a.data.time, 900);
  assertEquals(a.data.temperature, { value: "100", unit: "C" });
});

Deno.test("mode Pétrin → annotation MODE name=dough", () => {
  const p = mapRecipeToCookidoo({
    title: "T",
    ingredients: [],
    steps: [{ order: 1, text: "Activer le mode Pétrin /10 min.", tm7: { mode: "knead", seconds: 600 } }],
  });
  const a = p.instructions[0].annotations[0];
  assertEquals(a.type, "MODE");
  assertEquals(a.name, "dough");
  assertEquals(a.data.time, 600);
});

Deno.test("mode Rissoler → MODE name=browning avec température et puissance", () => {
  const p = mapRecipeToCookidoo({
    title: "T",
    ingredients: [],
    steps: [{
      order: 1,
      text: "Activer le mode Rissoler.",
      tm7: { mode: "high_temp", seconds: 360, temperature: 160 },
    }],
  });
  const a = p.instructions[0].annotations[0];
  assertEquals(a.type, "MODE");
  assertEquals(a.name, "browning");
  assertEquals(a.data.time, 360);
  assertEquals(a.data.temperature, { value: "160", unit: "C" });
  assertEquals(a.data.power, "Intense");
});

Deno.test("annotation INGREDIENT: data.description est une chaîne simple", () => {
  const p = mapRecipeToCookidoo({
    title: "T",
    ingredients: [{ name: "huile", quantity: 20, unit: "g" }],
    steps: [{ order: 1, text: "Mettre l'huile dans le bol." }],
  });
  const ing = p.instructions[0].annotations.find((a) => a.type === "INGREDIENT");
  assertEquals(typeof ing?.data.description, "string");
  assertEquals(ing?.data.description, "20 g d'huile");
});

// ── Puissance du rissolage (MODE browning) ───────────────────────────────────
// Vérifié sur sonde réelle (docs/COOKIDOO-CONTRAT.md §4) : `power` détermine
// l'intention machine — "Intense" → HighTemperature_FullPower,
// "Gentle" → HighTemperature_MediumPower. Le figer en dur forçait tous les
// rissolages à pleine puissance.

Deno.test("mapRecipeToCookidoo: rissolage — puissance par défaut « Intense »", () => {
  const recipe: Recipe = {
    title: "Test",
    ingredients: [],
    steps: [{ order: 1, text: "Rissoler 6 min/160°C.", tm7: { mode: "high_temp", seconds: 360, temperature: 160 } }],
  };
  const ann = mapRecipeToCookidoo(recipe).instructions[0].annotations
    .find((a) => a.type === "MODE");
  assertEquals(ann?.name, "browning");
  assertEquals((ann?.data as Record<string, unknown>).power, "Intense");
});

Deno.test("mapRecipeToCookidoo: rissolage — puissance douce explicite", () => {
  const recipe: Recipe = {
    title: "Test",
    ingredients: [],
    steps: [{
      order: 1,
      text: "Rissoler doucement 6 min/140°C.",
      tm7: { mode: "high_temp", seconds: 360, temperature: 140, power: "Gentle" },
    }],
  };
  const ann = mapRecipeToCookidoo(recipe).instructions[0].annotations
    .find((a) => a.type === "MODE");
  assertEquals((ann?.data as Record<string, unknown>).power, "Gentle");
});

Deno.test("mapRecipeToCookidoo: `power` ignoré hors rissolage", () => {
  const recipe: Recipe = {
    title: "Test",
    ingredients: [],
    steps: [{ order: 1, text: "Pétrir 3 min.", tm7: { mode: "knead", seconds: 180, power: "Gentle" } }],
  };
  const ann = mapRecipeToCookidoo(recipe).instructions[0].annotations
    .find((a) => a.type === "MODE");
  assertEquals(ann?.name, "dough");
  assertEquals((ann?.data as Record<string, unknown>).power, undefined);
});

Deno.test("mentions répétées : chaque portion garde sa quantité sans répéter le total", () => {
  const payload = mapRecipeToCookidoo({ title: "Huile", ingredients: [{ name: "huile", quantity: 40, unit: "g" }], steps: [{ order: 1, text: "Ajouter 10 g d'huile, puis 30 g d'huile." }] });
  assertEquals(payload.instructions[0].annotations.map((a) => a.data.description), ["10 g d'huile", "30 g d'huile"]);
});

Deno.test("réglages structurés sans texte : suffixe explicite sans chevauchement des ingrédients", () => {
  const payload = mapRecipeToCookidoo({ title: "Lait", ingredients: [{ name: "lait", quantity: 120, unit: "ml" }], steps: [{ order: 1, text: "Mélanger le lait.", tm7: { mode: "mix", seconds: 30, speed: "2" } }] });
  const [machine, ingredient] = payload.instructions[0].annotations;
  assertEquals(machine.position.offset > ingredient.position.offset + ingredient.position.length, true);
  assertEquals(payload.instructions[0].text.includes("Réglages TM7 : 30 s / vitesse 2."), true);
});

Deno.test("portion avec unité libre : ne remplace pas deux cuillères par le poids total", () => {
  for (const unit of ["cuillères", "doses"]) {
    const payload = mapRecipeToCookidoo({ title: "Huile", ingredients: [{ name: "huile d’olive", quantity: 40, unit: "g" }], steps: [{ order: 1, text: `Ajouter 2 ${unit} d’huile.` }] });
    assertEquals(payload.instructions[0].annotations[0].data.description, `2 ${unit} d’huile`);
  }
});
