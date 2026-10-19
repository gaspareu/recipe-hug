/** Diagnostic fermé : ne jamais journaliser l'exception ou la sortie IA brute. */
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

import { MACHINE_RULES } from "./machine-contract.ts";

export type AdaptationStage =
  | "quota"
  | "configuration"
  | "generation"
  | "validation"
  | "mapping"
  | "persistence";

const REASONS = new Map([
  ["Étape source inconnue.", "unknown_source_step"],
  ["Le four reste manuel.", "oven_must_remain_manual"],
  [
    "Réserver la préparation et vider le bol avant de le laver.",
    "bowl_not_empty_before_wash",
  ],
  [
    "L'eau technique ne peut pas servir à une autre action que la vapeur.",
    "technical_water_used_outside_steam",
  ],
  [
    "L'eau technique doit être réservée à une étape distincte avant la vapeur.",
    "technical_water_step_invalid",
  ],
  [
    "Réserver la préparation et vider le bol avant d'ajouter l'eau technique.",
    "bowl_not_empty_before_water",
  ],
  [
    "Ajouter l'eau technique dans le bol avant la vapeur.",
    "technical_water_missing",
  ],
  [
    "Une opération technique ne peut ajouter d'aliment.",
    "food_in_technical_step",
  ],
  [
    "Une instruction manuelle doit provenir de la recette source.",
    "manual_instruction_changed",
  ],
  ["Utilisation d'ingrédient invalide.", "invalid_ingredient_use"],
  ["Mesure manquante.", "missing_quantity"],
  ["Quantité inventée.", "invented_quantity"],
  ["Des actions de la recette ont été omises.", "source_actions_missing"],
  ["Un ingrédient a été omis.", "ingredient_missing"],
  ["Les quantités de la recette ont changé.", "quantities_changed"],
  ["Quantité inconnue utilisée plusieurs fois.", "unknown_quantity_repeated"],
  ["Quantité d'eau technique invalide.", "invalid_technical_water"],
  ["invalid_ai_output", "invalid_ai_output"],
  ["service_unavailable", "service_unavailable"],
  ["preparation_rate_limited", "preparation_rate_limited"],
]);
const FIELDS = new Set([
  "steps",
  "source_orders",
  "source_parts",
  "order",
  "part",
  "text",
  "manual_action",
  "duration_minutes",
  "tm7",
  "mode",
  "seconds",
  "temperature",
  "speed",
  "reverse",
  "accessory",
  "power",
  "uses",
  "ingredient_index",
  "quantity",
  "changes",
  "notes",
  "blockers",
]);

export function adaptationFailureDiagnostic(
  error: unknown,
  stage: AdaptationStage,
) {
  if (stage === "validation" && error instanceof z.ZodError) {
    return {
      stage,
      reason: "invalid_schema",
      issue_count: error.issues.length,
      issues: error.issues.slice(0, 5).map((issue) => ({
        code: issue.code,
        ...(issue.code === "custom" && typeof issue.params?.rule === "string" && Object.hasOwn(MACHINE_RULES, issue.params.rule)
          ? { rule: issue.params.rule as keyof typeof MACHINE_RULES } : {}),
        // Les noms de clés inconnues et les messages Zod peuvent contenir la réponse IA.
        path: issue.path.map((part) =>
          typeof part === "number" ? part : FIELDS.has(part) ? part : "*"
        ).join("."),
      })),
    };
  }
  if (stage === "validation" && error instanceof SyntaxError) {
    return { stage, reason: "invalid_json" };
  }
  if (error instanceof Error) {
    if (stage === "generation") {
      const http =
        /^(?:Anthropic error: |AI error \((?:openai|gemini|anthropic)\): )(\d{3})$/
          .exec(error.message);
      if (http) {
        return {
          stage,
          reason: "provider_http_error",
          http_status: Number(http[1]),
        };
      }
      if (error.name === "TimeoutError" || error.name === "AbortError") {
        return { stage, reason: "generation_timeout" };
      }
    }
    const reason = REASONS.get(error.message);
    if (reason) return { stage, reason };
  }
  return {
    stage,
    reason: stage === "mapping" ? "invalid_payload" : "unexpected_error",
  };
}
