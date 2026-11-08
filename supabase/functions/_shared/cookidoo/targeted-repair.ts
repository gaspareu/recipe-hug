/** Remplacements d'étapes uniquement, sur les indices du candidat initial signalés par le serveur. */
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { PlanError } from "./plan-errors.ts";
import { RepairSchema } from "./plan-schema.ts";

export function repairScope(error: unknown, count: number): number[] {
  if (
    error instanceof z.ZodError &&
    error.issues.some((issue) =>
      issue.path[0] !== "steps" || typeof issue.path[1] !== "number"
    )
  ) return [];
  const indexes = error instanceof PlanError
    ? error.step_indexes
    : error instanceof z.ZodError
    ? error.issues.flatMap((issue) =>
      issue.path[0] === "steps" && typeof issue.path[1] === "number"
        ? [issue.path[1]]
        : []
    )
    : [];
  return [
    ...new Set(
      indexes.filter((i) => Number.isInteger(i) && i >= 0 && i <= count),
    ),
  ];
}

export function applyTargetedRepair(
  candidate: unknown,
  output: unknown,
  allowed: number[],
): unknown {
  if (
    !candidate || typeof candidate !== "object" || !("steps" in candidate) ||
    !Array.isArray(candidate.steps)
  ) throw new PlanError("invalid_repair", []);
  const patch = RepairSchema.parse(output);
  const edits = new Map<number, unknown[]>();
  for (const edit of patch.edits) {
    if (
      !allowed.includes(edit.index) || edit.index > candidate.steps.length ||
      edits.has(edit.index)
    ) throw new PlanError("invalid_repair", []);
    edits.set(edit.index, edit.steps);
  }
  const steps = candidate.steps.flatMap((step, index) =>
    edits.get(index) ?? [step]
  );
  steps.push(...(edits.get(candidate.steps.length) ?? []));
  if (!steps.length || steps.length > 100) {
    throw new PlanError("invalid_repair", []);
  }
  // Ni la source ni les métadonnées du candidat ne peuvent être réécrites par le patch.
  return { ...candidate, steps };
}
