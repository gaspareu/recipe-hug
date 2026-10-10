import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { mapRecipeToCookidoo } from "./mapper.ts";
import { verifyReadback } from "./readback.ts";

const payload = () => mapRecipeToCookidoo({ title: "Mélange", ingredients: [{ name: "lait", quantity: 120, unit: "ml" }], steps: [{ order: 1, text: "Ajouter le lait. Mixer 30 s/vitesse 2.", tm7: { mode: "mix", seconds: 30, speed: "2" } }] });

Deno.test("relecture : confirme tout le contenu et accepte description enrichie par Cookidoo", () => {
  const expected = payload();
  const content = structuredClone(expected);
  const ingredient = content.instructions[0].annotations.find((a) => a.type === "INGREDIENT")!;
  ingredient.data.description = { text: ingredient.data.description, annotations: [] };
  assertEquals(verifyReadback(expected, { recipeContent: content }), []);
});

Deno.test("relecture : détecte disparition d'ingrédient, de texte et de réglages même si la requête a réussi", () => {
  const expected = payload(); const content = structuredClone(expected);
  content.ingredients = [];
  content.instructions[0].text = "Mélanger";
  content.instructions[0].annotations.find((a) => a.type === "TTS")!.data.speed = "5";
  assertEquals(verifyReadback(expected, content), ["content_mismatch", "annotations_mismatch"]);
  assertEquals(verifyReadback(expected, {}), ["content_not_verified"]);
});
