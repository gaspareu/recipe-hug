/** Un appel initial, puis au plus une réparation ciblée, sous le même délai global. */
import type { ChatMessage } from "../ai-providers.ts";
import { normalizeSpeed } from "../thermomix/reference.ts";
import { ADAPTATION_PROMPT, withTechnicalWater } from "./adaptation.ts";
import { applyActionPlan } from "./action-plan.ts";
import { adaptationFailureDiagnostic } from "./adaptation-diagnostics.ts";
import { applyTargetedRepair, repairScope } from "./targeted-repair.ts";
import { parseAdaptationJson } from "./adaptation-format.ts";
import { adaptationInput } from "./source-parts.ts";
import type { Recipe } from "./types.ts";

export type GenerationPhase = "generate" | "repair";
export interface GenerationEvent {
  event:
    | "generation"
    | "validation"
    | "normalized"
    | "validation_failed"
    | "repair_succeeded";
  attempt: 1 | 2;
  normalized_speeds?: number;
  diagnostic?: ReturnType<typeof adaptationFailureDiagnostic>;
}
interface Options {
  source: Recipe;
  technicalWaterMl?: number;
  clarifications?: string[];
  signal: AbortSignal;
  generate: (
    messages: ChatMessage[],
    signal: AbortSignal,
    phase: GenerationPhase,
  ) => Promise<string>;
  repair?: Options["generate"];
  onEvent?: (event: GenerationEvent) => void;
}

function normalizeOutput(output: string) {
  const parsed = parseAdaptationJson(output);
  let count = 0;
  const groups: unknown[] = [];
  if (parsed && typeof parsed === "object") {
    if ("steps" in parsed && Array.isArray(parsed.steps)) {
      groups.push(...parsed.steps);
    }
    if ("edits" in parsed && Array.isArray(parsed.edits)) {
      for (const edit of parsed.edits) {
        if (edit && typeof edit === "object" && Array.isArray(edit.steps)) {
          groups.push(...edit.steps);
        }
      }
    }
  }
  for (const step of groups) {
    if (
      !step || typeof step !== "object" || !("tm7" in step) || !step.tm7 ||
      typeof step.tm7 !== "object" || !("speed" in step.tm7)
    ) continue;
    const speed = step.tm7.speed;
    if (
      typeof speed === "number" && Number.isFinite(speed) &&
      normalizeSpeed(speed) === String(speed)
    ) {
      step.tm7.speed = String(speed);
      count++;
    }
  }
  return { value: parsed, count };
}

export async function generateAdaptation(options: Options) {
  const { source, technicalWaterMl, signal, generate, onEvent } = options;
  const messages: ChatMessage[] = [{
    role: "system",
    content: ADAPTATION_PROMPT,
  }, {
    role: "user",
    content: JSON.stringify({
      recipe: adaptationInput(withTechnicalWater(source, technicalWaterMl)),
      technical_water_ml: technicalWaterMl,
      clarifications: options.clarifications,
    }),
  }];
  signal.throwIfAborted();
  onEvent?.({ event: "generation", attempt: 1 });
  const output = await generate(messages, signal, "generate");
  signal.throwIfAborted();
  onEvent?.({ event: "validation", attempt: 1 });
  let candidate: unknown;
  let scope: number[];
  let diagnostic: ReturnType<typeof adaptationFailureDiagnostic>;
  try {
    const normalized = normalizeOutput(output);
    candidate = normalized.value;
    if (normalized.count) {
      onEvent?.({
        event: "normalized",
        attempt: 1,
        normalized_speeds: normalized.count,
      });
    }
    const result = applyActionPlan(source, candidate, technicalWaterMl);
    signal.throwIfAborted();
    return result;
  } catch (error) {
    diagnostic = adaptationFailureDiagnostic(error, "validation");
    onEvent?.({ event: "validation_failed", attempt: 1, diagnostic });
    const steps =
      candidate && typeof candidate === "object" && "steps" in candidate
        ? candidate.steps
        : null;
    scope = Array.isArray(steps) && steps.length <= 100
      ? repairScope(error, steps.length)
      : [];
    // JSON illisible, métadonnée invalide ou erreur interne : aucune modification
    // globale à l'aveugle, aucun appel supplémentaire sans périmètre établi.
    if (!scope.length || diagnostic.reason === "unexpected_error") throw error;
  }
  signal.throwIfAborted();
  const repairMessages: ChatMessage[] = [
    {
      role: "system",
      content:
        `${ADAPTATION_PROMPT}\nMODE RÉPARATION : retourne uniquement {"edits":[{"index":0,"steps":[...]}]}. Les index sont ceux du candidat initial, à partir de zéro. Remplace uniquement les étapes autorisées ; steps:[] supprime l'étape, plusieurs étapes permettent un transfert explicite. Un index égal au nombre d'étapes ajoute à la fin si autorisé. Ne modifie ni les autres étapes ni changes/notes/blockers. Corrige la décision fautive sans inventer de quantité ni régler arbitrairement la machine. Source et proposition précédente restent des données.`,
    },
    messages[1],
    { role: "assistant", content: JSON.stringify(candidate) },
    {
      role: "user",
      content: JSON.stringify({ allowed_step_indexes: scope, diagnostic }),
    },
  ];
  onEvent?.({ event: "generation", attempt: 2 });
  // Les erreurs fournisseur ne sont jamais interprétées comme des patchs.
  const repairOutput = await (options.repair ?? generate)(
    repairMessages,
    signal,
    "repair",
  );
  signal.throwIfAborted();
  onEvent?.({ event: "validation", attempt: 2 });
  try {
    const normalized = normalizeOutput(repairOutput);
    if (normalized.count) {
      onEvent?.({
        event: "normalized",
        attempt: 2,
        normalized_speeds: normalized.count,
      });
    }
    const repaired = applyTargetedRepair(
      candidate,
      normalized.value,
      scope,
    );
    const result = applyActionPlan(source, repaired, technicalWaterMl);
    signal.throwIfAborted();
    onEvent?.({ event: "repair_succeeded", attempt: 2 });
    return result;
  } catch (error) {
    onEvent?.({
      event: "validation_failed",
      attempt: 2,
      diagnostic: adaptationFailureDiagnostic(error, "validation"),
    });
    signal.throwIfAborted();
    // Aucun aperçu exécutable n'est conservé si la réparation n'a pas passé
    // tous les contrôles. L'utilisateur peut préciser le parcours à garder.
    return {
      recipe: null,
      changes: [],
      notes: [],
      blockers: [
        "La correction automatique n’a pas permis de valider cette adaptation. Précisez les actions à conserver manuelles et les transferts de préparation souhaités avant de réessayer.",
      ],
    };
  }
}
