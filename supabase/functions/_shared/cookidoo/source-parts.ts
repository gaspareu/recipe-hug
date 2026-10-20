import type { Recipe } from "./types.ts";

/** Découpe stable sans demander au modèle de compter des caractères ni de recopier. */
export function sourceParts(text: string): string[] {
  return text.trim().split(/(?<=[.!?])\s+(?=\p{Lu})|\n+/u).map((s) => s.trim())
    .filter(Boolean);
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
