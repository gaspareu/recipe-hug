/**
 * Diagnostic de qualité d'un export Cookidoo.
 *
 * Compare la recette source au payload produit. C'est ce qui permet de
 * distinguer deux causes très différentes d'une recette mal configurée sur
 * Cookidoo : soit la recette n'avait pas de paramètres machine dès le départ
 * (`steps_with_tm7` bas → problème de génération, en amont), soit elle en avait
 * mais le mapper n'a pas produit d'annotations (`steps_guided` bas alors que
 * `steps_with_tm7` est haut → problème de connecteur).
 */
import type { CookidooRecipePayload, Recipe } from "./types.ts";

export interface ExportDiagnostics {
  steps_total: number;
  /** Étapes portant des paramètres machine dans la recette source. */
  steps_with_tm7: number;
  /** Étapes ayant reçu une annotation déclenchant un réglage TM7 (TTS ou MODE). */
  steps_guided: number;
  annotations: Record<string, number>;
  ingredients_count: number;
  has_image: boolean;
  tools: string[];
}

export function buildExportDiagnostics(
  recipe: Recipe,
  payload: CookidooRecipePayload,
): ExportDiagnostics {
  const annotations: Record<string, number> = {};
  let stepsGuided = 0;

  for (const step of payload.instructions) {
    // Une annotation INGREDIENT ne fait que lier un texte à un ingrédient :
    // elle ne rend pas l'étape guidée.
    if (step.annotations.some((a) => a.type !== "INGREDIENT")) stepsGuided++;
    for (const annotation of step.annotations) {
      annotations[annotation.type] = (annotations[annotation.type] ?? 0) + 1;
    }
  }

  return {
    steps_total: recipe.steps.length,
    steps_with_tm7: recipe.steps.filter((s) => s.tm7).length,
    steps_guided: stepsGuided,
    annotations,
    ingredients_count: payload.ingredients.length,
    has_image: payload.image !== null,
    tools: [...payload.tools],
  };
}
