import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { applyAdaptation } from "./adaptation.ts";
import { adaptationFailureDiagnostic } from "./adaptation-diagnostics.ts";

Deno.test("diagnostic : JSON invalide sans exposer la réponse IA", () => {
  const error = assertThrows(() =>
    applyAdaptation(
      { title: "Privé", ingredients: [], steps: [] },
      "secret@example.com",
    )
  );
  assertEquals(adaptationFailureDiagnostic(error, "validation"), {
    stage: "validation",
    reason: "invalid_json",
  });
});

Deno.test("diagnostic : schéma invalide, seulement les chemins et codes", () => {
  const error = assertThrows(() =>
    applyAdaptation(
      { title: "Privé", ingredients: [], steps: [] },
      JSON.stringify({
        steps: [{
          source_orders: [1],
          text: "Recette privée",
          tm7: { mode: "secret@example.com", seconds: 1 },
          uses: [],
        }],
        changes: [],
        notes: [],
        blockers: [],
      }),
    )
  );
  const diagnostic = adaptationFailureDiagnostic(error, "validation");
  assertEquals(diagnostic.reason, "invalid_schema");
  assertEquals(
    diagnostic.issues?.some((issue) => issue.path === "steps.0.tm7.mode"),
    true,
  );
  assertEquals(
    JSON.stringify(diagnostic).includes("secret@example.com"),
    false,
  );
  assertEquals(JSON.stringify(diagnostic).includes("Recette privée"), false);
});

Deno.test("diagnostic : les contraintes métier identifient la cause réelle", () => {
  const source = {
    title: "Privé",
    ingredients: [{ name: "farine", quantity: 300, unit: "g" }],
    steps: [{ order: 1, text: "Mélanger." }],
  };
  const output = {
    steps: [{
      source_orders: [1],
      text: "Mélanger.",
      tm7: { mode: "mix", seconds: 20, speed: "2" },
      uses: [{ ingredient_index: 0, quantity: 299 }],
    }],
    changes: [],
    notes: [],
    blockers: [],
  };
  const error = assertThrows(() =>
    applyAdaptation(source, JSON.stringify(output))
  );
  assertEquals(adaptationFailureDiagnostic(error, "validation"), {
    stage: "validation",
    reason: "ingredient_mismatch",
    step_indexes: [0],
    source_parts: [],
    ingredient_indexes: [0],
  });
  output.steps[0].uses[0].quantity = 300;
  output.steps[0].text = "Reformulation manuelle.";
  const manual = { ...output, steps: [{ ...output.steps[0], tm7: null }] };
  const manualError = assertThrows(() =>
    applyAdaptation(source, JSON.stringify(manual))
  );
  assertEquals(
    adaptationFailureDiagnostic(manualError, "validation").reason,
    "manual_instruction_changed",
  );
});

Deno.test("diagnostic : aucune clé inconnue, valeur ou message Zod n'est journalisé", () => {
  const error = new z.ZodError([{
    code: "custom",
    path: ["steps", 0, "private-key@example.com"],
    message: "JWT et recette privée",
  }]);
  assertEquals(adaptationFailureDiagnostic(error, "validation"), {
    stage: "validation",
    reason: "invalid_schema",
    issue_count: 1,
    issues: [{ code: "custom", path: "steps.0.*" }],
  });
});

Deno.test("diagnostic : statut HTTP fournisseur, timeout et exception privée", () => {
  assertEquals(
    adaptationFailureDiagnostic(
      new Error("Anthropic error: 429"),
      "generation",
    ),
    { stage: "generation", reason: "provider_http_error", http_status: 429 },
  );
  assertEquals(
    adaptationFailureDiagnostic(
      new DOMException("Privé", "TimeoutError"),
      "generation",
    ),
    { stage: "generation", reason: "generation_timeout" },
  );
  for (
    const error of [new Error("secret@example.com JWT"), "réponse privée", {
      message: "privé",
    }]
  ) {
    assertEquals(adaptationFailureDiagnostic(error, "configuration"), {
      stage: "configuration",
      reason: "unexpected_error",
    });
  }
});
