import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  buildTm7ReferenceForPrompt,
  clampTemperature,
  normalizeSpeed,
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

// ── buildTm7ReferenceForPrompt ───────────────────────────────────────────────

Deno.test("buildTm7ReferenceForPrompt: contient les repères clés", () => {
  const ref = buildTm7ReferenceForPrompt();
  assertStringIncludes(ref, "RÉFÉRENTIEL THERMOMIX TM7");
  assertStringIncludes(ref, "Varoma");
  assertStringIncludes(ref, "sens inverse");
  assertStringIncludes(ref, "Rissoler");
  assertStringIncludes(ref, "fouet papillon");
});
