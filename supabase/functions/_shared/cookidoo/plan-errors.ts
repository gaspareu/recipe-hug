/** Erreurs fermées : références numériques seulement, aucune recette ni réponse IA. */
export const PLAN_REASONS = [
  "action_duplicate",
  "action_missing",
  "unknown_source_part",
  "manual_order_changed",
  "treatment_invalid",
  "transfer_invalid",
  "preparation_unavailable",
  "ingredient_mismatch",
  "bowl_not_empty_before_wash",
  "bowl_not_empty_before_water",
  "technical_water_missing",
  "technical_water_conflict",
  "plan_invalid",
  "invalid_repair",
] as const;
export type PlanReason = typeof PLAN_REASONS[number];
export const INGREDIENT_RULES = [
  "preparation_reference_required",
  "ingredient_missing",
  "invalid_ingredient",
  "duplicate_use",
  "missing_quantity",
  "unknown_quantity",
  "non_positive_quantity",
  "total_quantity_changed",
] as const;
export type IngredientRule = typeof INGREDIENT_RULES[number];
export interface SourcePart {
  order: number;
  part: number;
}
export class PlanError extends Error {
  constructor(
    readonly reason: PlanReason,
    readonly step_indexes: number[],
    readonly source_parts: SourcePart[] = [],
    readonly ingredient_indexes: number[] = [],
    readonly rule?: IngredientRule,
  ) {
    super(reason);
    this.name = "PlanError";
  }
}
