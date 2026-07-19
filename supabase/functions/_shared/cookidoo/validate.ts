/**
 * Validation structurelle du payload Cookidoo AVANT tout appel réseau.
 *
 * Objectif : échouer tôt et clairement (sans consommer d'authentification ni de
 * budget de requêtes ~10/min) quand la recette est inexploitable. Les plages
 * machine (vitesses/températures) sont déjà normalisées par le mapper via le
 * référentiel TM7 ; ici on ne contrôle que la structure minimale exportable.
 */
import type { CookidooRecipePayload } from "./types.ts";

export interface PayloadValidation {
  ok: boolean;
  errors: string[];
}

export function validateCookidooPayload(payload: CookidooRecipePayload): PayloadValidation {
  const errors: string[] = [];

  if (!payload.name || payload.name.trim().length === 0) {
    errors.push("titre manquant");
  }
  if (!Array.isArray(payload.ingredients) || payload.ingredients.length === 0) {
    errors.push("aucun ingrédient");
  }
  if (!Array.isArray(payload.instructions) || payload.instructions.length === 0) {
    errors.push("aucune étape");
  }

  return { ok: errors.length === 0, errors };
}
