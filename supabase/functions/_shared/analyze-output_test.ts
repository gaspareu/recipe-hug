import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { parseAnalysis } from "./analyze-output.ts";

const METADATA = { entry_kind: 'preparation', pairing_profile: {
  roles: ['base'], flavors: [], textures: [], equipment: [], allergens: [],
  dietary_compatibilities: [], dietary_exclusions: [], active_minutes: 10, make_ahead: false,
} };

Deno.test("parseAnalysis: JSON valide → ok avec données typées", () => {
  const res = parseAnalysis(
    JSON.stringify({ ...METADATA,
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
    '```json\n' + JSON.stringify({ ...METADATA, ai_summary: 'Salade fraîche', nutrition_tags: ['léger'], calorie_score: 5, season: 'été' }) + '\n```',
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
    JSON.stringify({ ...METADATA, ai_summary: "x", nutrition_tags: [], calorie_score: 9, season: "été" }),
  );
  assert(!res.ok);
});

Deno.test("parseAnalysis: nutrition_tags non-tableau → échec", () => {
  const res = parseAnalysis(
    JSON.stringify({ ...METADATA, ai_summary: "x", nutrition_tags: "protéines", calorie_score: 3, season: "été" }),
  );
  assert(!res.ok);
});

Deno.test("parseAnalysis: ai_summary manquant → échec", () => {
  const res = parseAnalysis(
    JSON.stringify({ ...METADATA, nutrition_tags: [], calorie_score: 3, season: "été" }),
  );
  assert(!res.ok);
});

Deno.test("parseAnalysis: champs inconnus retirés (on ne renvoie que le format attendu)", () => {
  const res = parseAnalysis(
    JSON.stringify({ ...METADATA,
      ai_summary: "x",
      nutrition_tags: [],
      calorie_score: 3,
      season: "été",
      __proto__pollution: true,
      arbitrary_field: "ignored",
    }),
  );
  assert(res.ok);
  assertEquals(Object.keys(res.data).sort(), ["ai_summary", "calorie_score", "entry_kind", "nutrition_tags", "pairing_profile", "season"]);
});

Deno.test("parseAnalysis: calorie_score et season nuls tolérés", () => {
  const res = parseAnalysis(
    JSON.stringify({ ...METADATA, ai_summary: "x", nutrition_tags: [], calorie_score: null, season: null }),
  );
  assert(res.ok);
  assertEquals(res.data.calorie_score, null);
  assertEquals(res.data.season, null);
});

Deno.test("parseAnalysis: plus de 5 tags → échec (garde-fou)", () => {
  const res = parseAnalysis(
    JSON.stringify({ ...METADATA,
      ai_summary: "x",
      nutrition_tags: ["a", "b", "c", "d", "e", "f"],
      calorie_score: 3,
      season: "été",
    }),
  );
  assert(!res.ok);
});

Deno.test("parseAnalysis: classement et profil sans fausse revue personnelle", () => {
  const profile = { roles: ['base'], flavors: ['doux'], textures: ['crémeux'], equipment: ['casserole'], allergens: ['lait'], dietary_compatibilities: ['végétarien'], dietary_exclusions: ['végan'], active_minutes: 15, make_ahead: true };
  const res = parseAnalysis(JSON.stringify({ ...METADATA, ai_summary: 'Une base douce.', entry_kind: 'preparation', pairing_profile: { ...profile, allergen_review_state: 'reviewed' } }));
  assert(res.ok);
  assertEquals(res.data.entry_kind, 'preparation');
  assertEquals(res.data.pairing_profile, profile);
});

Deno.test('parseAnalysis: rejette une analyse sans classement ou avec profil incomplet', () => {
  assert(!parseAnalysis(JSON.stringify({ ai_summary: 'Une base.' })).ok);
  assert(!parseAnalysis(JSON.stringify({ ...METADATA, ai_summary: 'Une base.', pairing_profile: { roles: ['base'] } })).ok);
  assert(!parseAnalysis(JSON.stringify({ ...METADATA, ai_summary: 'Une base.', pairing_profile: undefined })).ok);
});
