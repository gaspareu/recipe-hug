import {
  type IngredientRule,
  PlanError,
  type SourcePart,
} from "./plan-errors.ts";
import type { Ingredient } from "./types.ts";

interface IngredientUse {
  ingredient_index: number;
  quantity?: number | null;
}

/** Une seule règle de conservation, commune au plan et au rendu historique. */
export function resolveIngredientUses(
  ingredients: Ingredient[],
  steps: { uses: IngredientUse[]; source_parts?: SourcePart[] }[],
  missingScope: (ingredient: number) => number[] = () => [],
): (IngredientUse & { quantity: number | null })[][] {
  const additions = ingredients.map(() =>
    [] as { index: number; use: IngredientUse }[]
  );
  steps.forEach((step, index) => {
    const seen = new Set<number>();
    for (const use of step.uses) {
      if (!additions[use.ingredient_index] || seen.has(use.ingredient_index)) {
        throw new PlanError(
          "ingredient_mismatch",
          [index],
          step.source_parts ?? [],
          [
            use.ingredient_index,
          ],
          seen.has(use.ingredient_index)
            ? "duplicate_use"
            : "invalid_ingredient",
        );
      }
      seen.add(use.ingredient_index);
      additions[use.ingredient_index].push({ index, use });
    }
  });
  ingredients.forEach((ingredient, ingredient_index) => {
    const uses = additions[ingredient_index];
    const known = ingredient.quantity !== null && ingredient.quantity > 0;
    const quantities = uses.map(({ use }) =>
      use.quantity === undefined && uses.length === 1
        ? known ? ingredient.quantity : null
        : use.quantity
    );
    const total = quantities.reduce<number>(
      (sum, value) => sum + (value ?? 0),
      0,
    );
    const rule: IngredientRule | undefined = !uses.length
      ? "ingredient_missing"
      : !known && (uses.length !== 1 || quantities[0] !== null)
      ? "unknown_quantity"
      : known && quantities.some((q) => q === undefined || q === null)
      ? "missing_quantity"
      : known && quantities.some((q) => q! <= 0)
      ? "non_positive_quantity"
      : known &&
          Math.abs(total - ingredient.quantity!) >
            Math.max(1e-8, ingredient.quantity! * 1e-8)
      ? "total_quantity_changed"
      : undefined;
    if (rule) {
      throw new PlanError(
        "ingredient_mismatch",
        uses.length
          ? [...new Set(uses.map(({ index }) => index))]
          : missingScope(ingredient_index),
        uses.flatMap(({ index }) => steps[index].source_parts ?? []),
        [ingredient_index],
        rule,
      );
    }
  });
  return steps.map((step) =>
    step.uses.map((use) => ({
      ...use,
      quantity: use.quantity === undefined
        ? (ingredients[use.ingredient_index].quantity ?? 0) > 0
          ? ingredients[use.ingredient_index].quantity
          : null
        : use.quantity,
    }))
  );
}
