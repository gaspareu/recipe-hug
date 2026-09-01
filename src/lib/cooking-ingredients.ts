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
    .replace(/[’']/g, ' ')
    .toLocaleLowerCase('fr')
    .replace(/œ/g, 'oe')
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

interface IndexedToken {
  start: number;
  end: number;
  stem: string;
}

function indexedSignificantTokens(value: string): IndexedToken[] {
  return [...value.matchAll(/[\p{L}\p{N}]+/gu)]
    .map(match => ({
      start: match.index,
      end: match.index + match[0].length,
      normalized: normalizeText(match[0]),
    }))
    .filter(token => token.normalized.length >= 3 && !FRENCH_STOP_WORDS.has(token.normalized))
    .map(token => ({ start: token.start, end: token.end, stem: stemToken(token.normalized) }));
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

export interface CookingTextSegment {
  text: string;
  ingredient?: Ingredient;
  /** Texte à placer après la quantité quand le texte contenait déjà une quantité. */
  replacementSuffix?: string;
  /** L'unité de comptage était implicite dans le texte d'origine. */
  quantityWithoutUnit?: boolean;
  /** Forme singulière ou plurielle de l'unité déjà employée dans le texte. */
  replacementUnit?: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function flexibleUnitPattern(unit: string): string {
  return unit.split(/\s+/).map(token => {
    if (!/^\p{L}{3,}$/u.test(token)) return escapeRegExp(token);
    const singular = /[sx]$/iu.test(token) ? token.slice(0, -1) : token;
    return `${escapeRegExp(singular)}[sx]?`;
  }).join(String.raw`\s+`);
}

function findExistingQuantity(
  text: string,
  ingredientStart: number,
  ingredientEnd: number,
  ingredient: Ingredient,
): {
  start: number;
  replacementSuffix: string;
  quantityWithoutUnit: boolean;
  replacementUnit?: string;
} | null {
  const beforeIngredient = text.slice(0, ingredientStart);
  const unit = typeof ingredient.unit === 'string' ? ingredient.unit.trim() : '';
  const numberPattern = String.raw`(?:\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?)`;
  const unitPattern = unit ? flexibleUnitPattern(unit) : '';
  const patterns = unitPattern
    ? [{ pattern: String.raw`(?:${numberPattern}\s*${unitPattern}|(?:une|un)\s+${unitPattern})`, quantityWithoutUnit: false }]
    : [{ pattern: numberPattern, quantityWithoutUnit: false }];
  if (new Set(['piece', 'pieces', 'unite', 'unites']).has(normalizeText(unit))) {
    patterns.push({ pattern: numberPattern, quantityWithoutUnit: true });
  }

  const matched = patterns.map(candidate => ({
    ...candidate,
    match: beforeIngredient.match(new RegExp(
      String.raw`(${candidate.pattern})(\s*(?:(?:de|du|des)\s+|d[’'])?)$`,
      'iu',
    )),
  })).find(candidate => candidate.match);
  if (!matched?.match) return null;
  const replacementUnit = unitPattern && !matched.quantityWithoutUnit
    ? matched.match[1].replace(new RegExp(String.raw`^(?:${numberPattern}\s*|(?:une|un)\s+)`, 'iu'), '')
    : undefined;

  return {
    start: beforeIngredient.length - matched.match[0].length,
    replacementSuffix: `${matched.match[2] || ' '}${text.slice(ingredientStart, ingredientEnd)}`,
    quantityWithoutUnit: matched.quantityWithoutUnit,
    replacementUnit,
  };
}

/**
 * Découpe le texte d'une étape autour des mentions d'ingrédients afin que
 * l'interface puisse afficher leur quantité au fil de la phrase.
 */
export function annotateCookingText(
  text: string,
  ingredients: readonly Ingredient[],
): CookingTextSegment[] {
  const textTokens = indexedSignificantTokens(text);
  if (textTokens.length === 0 || ingredients.length === 0) return [{ text }];

  const tokenFrequency = new Map<string, number>();
  const ingredientTokens = ingredients.map(ingredient => {
    const tokens = [...new Set(significantTokens(ingredient.name))];
    tokens.forEach(token => tokenFrequency.set(token, (tokenFrequency.get(token) ?? 0) + 1));
    return tokens;
  });

  const matches = ingredients.flatMap((ingredient, ingredientIndex) => {
    const tokens = ingredientTokens[ingredientIndex];
    if (tokens.length === 0) return [];

    for (let startIndex = 0; startIndex <= textTokens.length - tokens.length; startIndex += 1) {
      const candidate = textTokens.slice(startIndex, startIndex + tokens.length);
      if (candidate.every((token, index) => token.stem === tokens[index])) {
        const start = candidate[0].start;
        const end = candidate[candidate.length - 1].end;
        const existingQuantity = findExistingQuantity(text, start, end, ingredient);
        return [{
          start: existingQuantity?.start ?? start,
          end,
          ingredient,
          replacementSuffix: existingQuantity?.replacementSuffix,
          quantityWithoutUnit: existingQuantity?.quantityWithoutUnit,
          replacementUnit: existingQuantity?.replacementUnit,
        }];
      }
    }

    const distinctiveToken = textTokens.find(token =>
      tokens.includes(token.stem) && tokenFrequency.get(token.stem) === 1,
    );
    if (!distinctiveToken) return [];
    const existingQuantity = findExistingQuantity(text, distinctiveToken.start, distinctiveToken.end, ingredient);
    return [{
      start: existingQuantity?.start ?? distinctiveToken.start,
      end: distinctiveToken.end,
      ingredient,
      replacementSuffix: existingQuantity?.replacementSuffix,
      quantityWithoutUnit: existingQuantity?.quantityWithoutUnit,
      replacementUnit: existingQuantity?.replacementUnit,
    }];
  }).sort((a, b) => a.start - b.start || b.end - a.end);

  const nonOverlapping = matches.reduce<typeof matches>((accepted, match) => {
    const previous = accepted[accepted.length - 1];
    if (!previous || match.start >= previous.end) accepted.push(match);
    return accepted;
  }, []);
  if (nonOverlapping.length === 0) return [{ text }];

  const segments: CookingTextSegment[] = [];
  let cursor = 0;
  nonOverlapping.forEach(match => {
    if (match.start > cursor) segments.push({ text: text.slice(cursor, match.start) });
    segments.push({
      text: text.slice(match.start, match.end),
      ingredient: match.ingredient,
      replacementSuffix: match.replacementSuffix,
      quantityWithoutUnit: match.quantityWithoutUnit,
      replacementUnit: match.replacementUnit,
    });
    cursor = match.end;
  });
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
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
