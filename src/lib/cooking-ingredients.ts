import type { Ingredient, Step } from '@/types/recipe';

const FRENCH_STOP_WORDS = new Set([
  'avec', 'dans', 'des', 'les', 'une', 'pour', 'aux', 'sur', 'sous',
  'petit', 'petite', 'petits', 'petites', 'grand', 'grande', 'grands', 'grandes',
  'frais', 'fraiche', 'fraiches', 'entier', 'entiere', 'entiers', 'entieres',
]);

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/[’']/g, ' ')
    .toLocaleLowerCase('fr')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stemToken(token: string): string {
  if (token.length > 4 && (token.endsWith('s') || token.endsWith('x'))) {
    return token.slice(0, -1);
  }
  return token;
}

function significantTokens(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .filter(token => token.length >= 3 && !FRENCH_STOP_WORDS.has(token))
    .map(stemToken);
}

function matchesReference(ingredientName: string, reference: string): boolean {
  const ingredient = normalizeText(ingredientName);
  const ref = normalizeText(reference);
  if (!ingredient || !ref) return false;
  return ingredient === ref || ingredient.includes(ref) || ref.includes(ingredient);
}

/**
 * Retrouve les ingrédients pertinents pour une étape.
 *
 * Les associations explicites générées avec la recette sont prioritaires.
 * Pour les anciennes recettes, un repli déterministe compare les mots
 * significatifs du nom de l'ingrédient au texte de l'étape.
 */
export function getStepIngredients(step: Step, ingredients: readonly Ingredient[]): Ingredient[] {
  const explicitNames = step.ingredient_names?.filter(name => name.trim().length > 0) ?? [];
  if (explicitNames.length > 0) {
    const explicitMatches = ingredients.filter(ingredient =>
      explicitNames.some(reference => matchesReference(ingredient.name, reference)),
    );
    if (explicitMatches.length > 0) return explicitMatches;
  }

  const stepTokens = new Set(significantTokens(step.text));
  if (stepTokens.size === 0) return [];

  const tokenFrequency = new Map<string, number>();
  const ingredientTokens = ingredients.map(ingredient => {
    const tokens = [...new Set(significantTokens(ingredient.name))];
    tokens.forEach(token => tokenFrequency.set(token, (tokenFrequency.get(token) ?? 0) + 1));
    return tokens;
  });
  const normalizedStep = normalizeText(step.text);

  return ingredients.filter((ingredient, index) => {
    const normalizedName = normalizeText(ingredient.name);
    if (normalizedName && normalizedStep.includes(normalizedName)) return true;

    const tokens = ingredientTokens[index];
    const matchingTokens = tokens.filter(token => stepTokens.has(token));
    if (matchingTokens.length === 0) return false;

    // Un mot partagé (« huile », « sucre »…) ne suffit pas à départager deux
    // ingrédients. On conserve en revanche un nom simple, deux mots concordants
    // ou un mot distinctif qui n'apparaît dans aucun autre ingrédient.
    return tokens.length === 1
      || matchingTokens.length >= 2
      || matchingTokens.some(token => tokenFrequency.get(token) === 1);
  });
}

/** Quantité lisible en français, sans afficher le zéro conventionnel. */
export function formatCookingQuantity(ingredient: Ingredient): string {
  const unit = typeof ingredient.unit === 'string' ? ingredient.unit.trim() : '';
  const rawQuantity = ingredient.quantity as number | string | null;

  if (typeof rawQuantity === 'number') {
    const quantity = rawQuantity > 0
      ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(rawQuantity)
      : '';
    return [quantity, unit].filter(Boolean).join(' ');
  }

  const quantity = typeof rawQuantity === 'string' ? rawQuantity.trim() : '';
  return [quantity, unit].filter(Boolean).join(' ');
}
