import type { Recipe } from "./types.ts";

/** Découpe stable sans demander au modèle de compter des caractères ni de recopier. */
export function sourceParts(text: string): string[] {
  const parts = text.trim().split(/(?<=[.!?])\s+(?=\p{Lu})|\n+/u)
    .map((part) => part.trim()).filter(Boolean);
  // Le mélange dans le plat suivi de son enfournement forme un seul rôtissage.
  if (
    parts.length === 3 &&
    /^pr[ée]chauff\p{L}*\s+(?:le\s+)?four\b/iu.test(parts[0]) &&
    /\bdans (?:un|le) plat\b/iu.test(parts[1]) &&
    /\bm[ée]lang\p{L}*\b/iu.test(parts[1]) &&
    /^enfourn\p{L}*\b/iu.test(parts[2])
  ) return [text.trim()];
  return parts;
}

export function adaptationInput(source: Recipe): unknown {
  return {
    title: source.title,
    servings: source.servings,
    ingredients: source.ingredients,
    steps: [...source.steps].sort((a, b) => a.order - b.order).map((s) => ({
      order: s.order,
      parts: sourceParts(s.text),
      ...(s.tm7 ? { tm7: s.tm7 } : {}),
      ...(s.duration_minutes !== undefined
        ? { duration_minutes: s.duration_minutes }
        : {}),
    })),
  };
}
