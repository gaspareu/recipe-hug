import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { parseAnalysis } from "./analyze-output.ts";

Deno.test("parseAnalysis: JSON valide → ok avec données typées", () => {
  const res = parseAnalysis(
    JSON.stringify({
      ai_summary: "Un plat réconfortant.",
      nutrition_tags: ["protéines", "fibres"],
      calorie_score: 3,
      season: "hiver",
    }),
  );
  assert(res.ok);
  assertEquals(res.data.ai_summary, "Un plat réconfortant.");
  assertEquals(res.data.nutrition_tags, ["protéines", "fibres"]);
  assertEquals(res.data.calorie_score, 3);
  assertEquals(res.data.season, "hiver");
});

Deno.test("parseAnalysis: JSON entouré de ```json → nettoyé puis parsé", () => {
  const res = parseAnalysis(
    '```json\n{"ai_summary":"Salade fraîche","nutrition_tags":["léger"],"calorie_score":5,"season":"été"}\n```',
  );
  assert(res.ok);
  assertEquals(res.data.calorie_score, 5);
});

Deno.test("parseAnalysis: texte non-JSON → échec (pas de confiance aveugle)", () => {
  const res = parseAnalysis("Voici l'analyse : la recette est légère.");
  assert(!res.ok);
});

Deno.test("parseAnalysis: calorie_score hors plage 1-5 → échec", () => {
  const res = parseAnalysis(
    JSON.stringify({ ai_summary: "x", nutrition_tags: [], calorie_score: 9, season: "été" }),
  );
  assert(!res.ok);
});

Deno.test("parseAnalysis: nutrition_tags non-tableau → échec", () => {
  const res = parseAnalysis(
    JSON.stringify({ ai_summary: "x", nutrition_tags: "protéines", calorie_score: 3, season: "été" }),
  );
  assert(!res.ok);
});

Deno.test("parseAnalysis: ai_summary manquant → échec", () => {
  const res = parseAnalysis(
    JSON.stringify({ nutrition_tags: [], calorie_score: 3, season: "été" }),
  );
  assert(!res.ok);
});

Deno.test("parseAnalysis: champs inconnus retirés (on ne renvoie que le format attendu)", () => {
  const res = parseAnalysis(
    JSON.stringify({
      ai_summary: "x",
      nutrition_tags: [],
      calorie_score: 3,
      season: "été",
      __proto__pollution: true,
      arbitrary_field: "ignored",
    }),
  );
  assert(res.ok);
  assertEquals(Object.keys(res.data).sort(), ["ai_summary", "calorie_score", "nutrition_tags", "season"]);
});

Deno.test("parseAnalysis: calorie_score et season nuls tolérés", () => {
  const res = parseAnalysis(
    JSON.stringify({ ai_summary: "x", nutrition_tags: [], calorie_score: null, season: null }),
  );
  assert(res.ok);
  assertEquals(res.data.calorie_score, null);
  assertEquals(res.data.season, null);
});

Deno.test("parseAnalysis: plus de 5 tags → échec (garde-fou)", () => {
  const res = parseAnalysis(
    JSON.stringify({
      ai_summary: "x",
      nutrition_tags: ["a", "b", "c", "d", "e", "f"],
      calorie_score: 3,
      season: "été",
    }),
  );
  assert(!res.ok);
});
