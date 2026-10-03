import { scaleIngredients } from '@/lib/recipe-scaling';
import type { Ingredient, Recipe } from '@/types/recipe';
import type { Composition, CookingRun, CookingRunStep, CookingSegment, CookingTarget } from '@/types/livre';

export function resolveCookingRun(
  target: CookingTarget,
  recipes: Recipe[],
  compositions: Composition[],
): CookingRun {
  if (!Number.isFinite(target.servings) || target.servings <= 0) throw new Error('Nombre de portions invalide');
  const recipeMap = new Map(recipes.map(recipe => [recipe.id, recipe]));
  const compositionMap = new Map(compositions.map(composition => [composition.id, composition]));
  const segments: CookingSegment[] = [];
  const steps: CookingRunStep[] = [];
  let title = '';

  const addRecipe = (id: string, key: string, factor: number, course: string | null) => {
    const recipe = recipeMap.get(id);
    if (!recipe) throw new Error('Une fiche de cette composition est inaccessible');
    const baseServings = recipe.servings && recipe.servings > 0 ? recipe.servings : 2;
    const ingredients = scaleIngredients(recipe.ingredients, baseServings, target.servings * factor);
    const segment: CookingSegment = { key, course, recipe: structuredClone(recipe), factor, ingredients };
    segments.push(segment);
    for (const [index, step] of [...recipe.steps].sort((a, b) => a.order - b.order).entries()) {
      steps.push({
        key: `${key}/step${index}:${step.order}`,
        segmentKey: key,
        sourceTitle: recipe.title,
        course,
        step: structuredClone(step),
        ingredients,
        assembly: false,
      });
    }
  };

  const addComposition = (id: string, key: string, factor: number, inheritedCourse: string | null, expectedKind: 'dish' | 'menu') => {
    const composition = compositionMap.get(id);
    if (!composition || composition.kind !== expectedKind) throw new Error('Composition inaccessible ou invalide');
    if (composition.items.length === 0) throw new Error('Cette composition ne contient aucune fiche');
    for (const item of [...composition.items].sort((a, b) => a.position - b.position)) {
      const itemKey = `${key}/item:${item.id}`;
      const itemFactor = factor * item.quantity_factor;
      if (!Number.isFinite(itemFactor) || itemFactor <= 0) throw new Error('Coefficient de quantité invalide');
      const course = item.course || inheritedCourse;
      if (item.recipe_id) addRecipe(item.recipe_id, `${itemKey}/recipe:${item.recipe_id}`, itemFactor, course);
      else if (item.child_composition_id && composition.kind === 'menu') {
        addComposition(item.child_composition_id, `${itemKey}/dish:${item.child_composition_id}`, itemFactor, course, 'dish');
      } else throw new Error('Élément de composition invalide');
    }
    for (const [index, text] of composition.assembly_steps.entries()) {
      if (!text.trim()) continue;
      steps.push({
        key: `${key}/assembly:${index}`,
        segmentKey: key,
        sourceTitle: composition.title,
        course: inheritedCourse,
        step: { order: index + 1, text, title: 'Dressage et service' },
        ingredients: [],
        assembly: true,
      });
    }
  };

  if (target.type === 'recipe') {
    const recipe = recipeMap.get(target.id);
    if (!recipe) throw new Error('Recette introuvable');
    title = recipe.title;
    addRecipe(recipe.id, `recipe:${recipe.id}`, 1, null);
  } else {
    const composition = compositionMap.get(target.id);
    if (!composition || composition.kind !== target.type) throw new Error('Composition introuvable');
    title = composition.title;
    addComposition(composition.id, `${composition.kind}:${composition.id}`, 1, null, composition.kind);
  }
  if (steps.length === 0) throw new Error('Aucune étape à cuisiner dans cette composition');
  const ingredients: Ingredient[] = segments.flatMap(segment => segment.ingredients);
  return { target, title, segments, steps, ingredients };
}

/** Regroupe uniquement les quantités numériques sûres ; les anciens libellés restent distincts. */
export function aggregateCookingIngredients(ingredients: Ingredient[]): Ingredient[] {
  const result: Ingredient[] = [];
  const indexes = new Map<string, number>();
  for (const ingredient of ingredients) {
    if (typeof ingredient.quantity !== 'number' || !Number.isFinite(ingredient.quantity)) {
      result.push({ ...ingredient });
      continue;
    }
    const key = `${ingredient.name.trim().toLocaleLowerCase('fr')}|${ingredient.unit.trim().toLocaleLowerCase('fr')}`;
    const index = indexes.get(key);
    if (index === undefined) {
      indexes.set(key, result.length);
      result.push({ ...ingredient });
    } else {
      result[index] = { ...result[index], quantity: result[index].quantity + ingredient.quantity };
    }
  }
  return result;
}

/** Un saut direct change la position sans valider les étapes traversées. */
export function advanceCookingRun(
  steps: CookingRunStep[], index: number, completed: ReadonlySet<string>,
): { index: number; completed: Set<string> } {
  const nextCompleted = new Set(completed);
  nextCompleted.add(steps[index].key);
  if (steps.every(step => nextCompleted.has(step.key))) return { index: steps.length, completed: nextCompleted };
  if (index < steps.length - 1) return { index: index + 1, completed: nextCompleted };
  const firstIncomplete = steps.findIndex(step => !nextCompleted.has(step.key));
  return { index: firstIncomplete < 0 ? steps.length : firstIncomplete, completed: nextCompleted };
}
