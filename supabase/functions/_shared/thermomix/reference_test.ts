import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  buildTm7ReferenceForPrompt,
  clampTemperature,
  normalizeSpeed,
  validateTm7Params,
  VAROMA,
} from "./reference.ts";

// ── normalizeSpeed ───────────────────────────────────────────────────────────

Deno.test("normalizeSpeed: nombres valides → forme canonique", () => {
  assertEquals(normalizeSpeed(5), "5");
  assertEquals(normalizeSpeed(0.5), "0.5");
  assertEquals(normalizeSpeed(2.5), "2.5");
  assertEquals(normalizeSpeed(10), "10");
});

Deno.test("normalizeSpeed: texte (virgule, Turbo, mijotage)", () => {
  assertEquals(normalizeSpeed("2,5"), "2.5");
  assertEquals(normalizeSpeed("Turbo"), "Turbo");
  assertEquals(normalizeSpeed("turbo"), "Turbo");
  assertEquals(normalizeSpeed("vitesse mijotage"), "mijotage");
});

Deno.test("normalizeSpeed: hors plage / non reconnu → null", () => {
  assertEquals(normalizeSpeed(25), null);
  assertEquals(normalizeSpeed(0), null);
  assertEquals(normalizeSpeed(-3), null);
  assertEquals(normalizeSpeed("n'importe quoi"), null);
  assertEquals(normalizeSpeed(""), null);
  assertEquals(normalizeSpeed(undefined), null);
});

// ── clampTemperature ─────────────────────────────────────────────────────────

Deno.test("clampTemperature: dans la plage / Varoma conservé", () => {
  assertEquals(clampTemperature(100), 100);
  assertEquals(clampTemperature(37), 37);
  assertEquals(clampTemperature(VAROMA), VAROMA);
});

Deno.test("clampTemperature: bornage doux et rejet des valeurs absurdes", () => {
  assertEquals(clampTemperature(165), 160); // borné au max
  assertEquals(clampTemperature(30), 37); // borné au min
  assertEquals(clampTemperature(500), null); // absurde → rejeté
  assertEquals(clampTemperature(-10), null);
  assertEquals(clampTemperature(undefined), null);
});

// ── validateTm7Params ────────────────────────────────────────────────────────

Deno.test("validateTm7Params: paramètres cohérents → ok", () => {
  assertEquals(validateTm7Params({ mode: "chop", speed: "7", seconds: 5 }).ok, true);
  assertEquals(
    validateTm7Params({ mode: "steam", temperature: VAROMA, speed: "1", seconds: 900 }).ok,
    true,
  );
});

Deno.test("validateTm7Params: vitesse trop élevée en cuisson vapeur", () => {
  const res = validateTm7Params({ mode: "steam", speed: "8" });
  assertEquals(res.ok, false);
  assertStringIncludes(res.errors.join(" "), "vapeur");
});

Deno.test("validateTm7Params: température et vitesse hors plage", () => {
  assertEquals(validateTm7Params({ mode: "cook", temperature: 500 }).ok, false);
  assertEquals(validateTm7Params({ mode: "cook", speed: "25" }).ok, false);
  assertEquals(validateTm7Params({ mode: "cook", seconds: -1 }).ok, false);
});

Deno.test("validateTm7Params: mode inconnu rejeté", () => {
  // @ts-expect-error mode volontairement invalide
  assertEquals(validateTm7Params({ mode: "teleportation" }).ok, false);
});

// ── buildTm7ReferenceForPrompt ───────────────────────────────────────────────

Deno.test("buildTm7ReferenceForPrompt: contient les repères clés", () => {
  const ref = buildTm7ReferenceForPrompt();
  assertStringIncludes(ref, "RÉFÉRENTIEL THERMOMIX TM7");
  assertStringIncludes(ref, "Varoma");
  assertStringIncludes(ref, "sens inverse");
  assertStringIncludes(ref, "Rissoler");
  assertStringIncludes(ref, "fouet papillon");
});
