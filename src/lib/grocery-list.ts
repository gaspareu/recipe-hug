// Logique pure d'agrégation de la liste de courses, extraite de
// `GroceryListSheet` pour être testable indépendamment du rendu.

export interface GroceryIngredient {
  name: string;
  quantity: number | string | null;
  unit: string | null;
  category: string;
}

export interface AggregatedItem {
  name: string;
  quantities: string[];
  category: string;
}

/**
 * Fusionne une liste d'ingrédients en regroupant les quantités.
 * - Quantités numériques : additionnées par couple (nom, unité).
 * - Quantités non numériques (ex. "une pincée") : conservées distinctes par nom.
 */
export function aggregateIngredients(ingredients: GroceryIngredient[]): AggregatedItem[] {
  const numericMap = new Map<string, { name: string; unit: string | null; total: number; category: string }>();
  const nonNumericList: { name: string; quantities: string[]; category: string }[] = [];

  for (const ing of ingredients) {
    const numericQty = typeof ing.quantity === 'number'
      ? ing.quantity
      : typeof ing.quantity === 'string' && ing.quantity.trim() !== '' && !isNaN(Number(ing.quantity))
        ? Number(ing.quantity)
        : null;

    if (numericQty !== null) {
      const unit = ing.unit?.trim() || '';
      const key = `${ing.name.toLowerCase().trim()}|${unit.toLowerCase()}`;
      const existing = numericMap.get(key);
      if (existing) {
        numericMap.set(key, { ...existing, total: existing.total + numericQty });
      } else {
        numericMap.set(key, {
          name: ing.name,
          unit: ing.unit || null,
          total: numericQty,
          category: ing.category || 'Autres',
        });
      }
    } else {
      // Quantité non numérique : on garde les valeurs distinctes, groupées par nom.
      const qtyStr = ing.quantity && ing.unit
        ? `${ing.quantity} ${ing.unit}`
        : ing.quantity
          ? `${ing.quantity}`
          : '';
      const entry = nonNumericList.find(e => e.name.toLowerCase().trim() === ing.name.toLowerCase().trim());
      if (entry) {
        if (qtyStr && !entry.quantities.includes(qtyStr)) {
          entry.quantities.push(qtyStr);
        }
      } else {
        nonNumericList.push({
          name: ing.name,
          quantities: qtyStr ? [qtyStr] : [],
          category: ing.category || 'Autres',
        });
      }
    }
  }

  const numericResults = Array.from(numericMap.values()).map(({ name, unit, total, category }) => ({
    name,
    quantities: [unit ? `${total} ${unit}` : `${total}`],
    category,
  }));

  return [...numericResults, ...nonNumericList];
}

/**
 * Regroupe les ingrédients agrégés par catégorie, en triant les catégories
 * par ordre alphabétique (locale fr) et en plaçant « Autres » en dernier.
 */
export function groupByCategory(items: AggregatedItem[]): [string, AggregatedItem[]][] {
  const groups: Record<string, AggregatedItem[]> = {};
  for (const item of items) {
    const cat = item.category;
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }
  return Object.entries(groups).sort(([a], [b]) => {
    if (a === 'Autres') return 1;
    if (b === 'Autres') return -1;
    return a.localeCompare(b, 'fr');
  });
}
