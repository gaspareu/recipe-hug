import type { Ingredient } from '@/types/recipe';

/** Arrondit à 2 décimales max en supprimant les zéros inutiles (2.50 → 2.5, 4.00 → 4). */
function roundQuantity(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Recalcule les quantités d'une liste d'ingrédients pour un nombre de portions
 * cible. Fonction pure (retourne une nouvelle liste, ne mute pas l'entrée).
 * - Les quantités numériques > 0 sont multipliées par `targetServings / baseServings`.
 * - Les quantités nulles (« pincée », « qs ») restent inchangées.
 * - Si `baseServings <= 0`, on ne peut pas scaler : la liste est renvoyée telle quelle.
 */
export function scaleIngredients(
  ingredients: readonly Ingredient[],
  baseServings: number,
  targetServings: number,
): Ingredient[] {
  if (baseServings <= 0 || targetServings <= 0) {
    return ingredients.map(ing => ({ ...ing }));
  }
  const factor = targetServings / baseServings;
  return ingredients.map(ing => {
    const qty = typeof ing.quantity === 'number' ? ing.quantity : 0;
    if (qty <= 0) return { ...ing };
    return { ...ing, quantity: roundQuantity(qty * factor) };
  });
}
