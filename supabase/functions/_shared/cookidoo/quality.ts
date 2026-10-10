import type { Recipe, CookidooRecipePayload } from "./types.ts";
import { hasAmbiguousUnit } from "./units.ts";

/** Une étape mêlant action machine et action manuelle doit être clarifiée avant adaptation. */
export function isExplicitlyManual(text: string): boolean {
  return /\b(?:saladier|fourchette|four|faconner|faconnez|etaler|etalez|reposer|reserver|reservez|enfourner|enfournez)\b|a la main|laisser\s+(?:lever|pousser)/i.test(text.normalize("NFD").replace(/\p{M}/gu, ""));
}

export function exportQualityNotes(recipe: Recipe, payload: CookidooRecipePayload): string[] {
  const notes: string[] = [];
  const ordered = [...recipe.steps].sort((a, b) => a.order - b.order);
  const missing = ordered.filter((step, i) =>
    /\b(?:mélanger|mélangez|mixer|mixez|pétrir|pétrissez|hacher|hachez|remuer|fouetter|broyer|rissoler|chauffer|cuire|vapeur)\b/i.test(step.text) &&
    !isExplicitlyManual(step.text) &&
    !payload.instructions[i]?.annotations.some((a) => a.type !== "INGREDIENT")
  );
  if (missing.length) notes.push(`Réglages machine absents aux étapes ${missing.map((s) => s.order).join(", ")}. Ces actions resteront manuelles.`);
  for (const step of ordered) {
    if (/\b(?:cuillères?|tasses?|verres?|poignées?|louches?)\b(?!\s+à\s+(?:soupe|café))/i.test(step.text)) notes.push(`Étape ${step.order} : mesure approximative ou taille du contenant non précisée ; aucune conversion en poids n'est appliquée.`);
  }
  for (const ingredient of recipe.ingredients) {
    if (hasAmbiguousUnit(ingredient.unit)) notes.push(`${ingredient.name} : « ${ingredient.unit} » ne précise pas la taille de la mesure. Aucune conversion en grammes n'est appliquée.`);
  }
  return notes;
}
