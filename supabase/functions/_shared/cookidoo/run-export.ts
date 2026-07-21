/**
 * Orchestration d'un export vers Cookidoo, à partir d'un contexte déjà
 * authentifié.
 *
 * Les opérations réseau sont injectées (`CookidooOps`) plutôt qu'importées
 * directement : c'est ce qui rend l'enchaînement testable — notamment les
 * chemins d'échec (rollback, dégradation des annotations), impossibles à
 * provoquer contre l'API réelle.
 *
 * Le `login` reste volontairement en dehors : il dépend des identifiants
 * déchiffrés, qui n'ont rien à faire ici.
 */
import { CookidooHttpError, type ClientCtx } from "./client.ts";
import type { CookidooRecipePayload } from "./types.ts";

/** Recette créée sur Cookidoo mais ni remplie ni supprimable : nettoyage manuel requis. */
export class PartialCreateError extends Error {
  constructor(public readonly cookidooRecipeId: string, public override readonly cause: unknown) {
    super(
      `Recette partiellement créée sur Cookidoo (id ${cookidooRecipeId}) : ` +
        `le remplissage a échoué et la suppression automatique aussi. ` +
        `Supprimez-la depuis Cookidoo, ou via le CLI (--delete ${cookidooRecipeId}).`,
    );
    this.name = "PartialCreateError";
  }
}

export interface CookidooOps {
  getRecipe(ctx: ClientCtx, id: string): Promise<unknown>;
  createRecipe(ctx: ClientCtx, name: string): Promise<string>;
  fillRecipe(ctx: ClientCtx, id: string, payload: CookidooRecipePayload): Promise<void>;
  renameRecipe(ctx: ClientCtx, id: string, name: string): Promise<unknown>;
  deleteRecipe(ctx: ClientCtx, id: string): Promise<unknown>;
  uploadRecipeImage(ctx: ClientCtx, id: string, imageUrl: string, host: string): Promise<void>;
  findUnguidedSteps(ctx: ClientCtx, id: string, expected: number[]): Promise<number[]>;
  recipeWebUrl(ctx: ClientCtx, id: string): string;
}

export interface RunExportInput {
  ctx: ClientCtx;
  payload: CookidooRecipePayload;
  /**
   * Identifiant Cookidoo mémorisé pour cette recette, ou null. Sa validité est
   * vérifiée ici même (cf. `resolveExistingId`) : il peut désigner une recette
   * supprimée entretemps côté Cookidoo.
   */
  existingId: string | null;
  imageUrl?: string;
  /** Hôte Supabase, pour la validation anti-SSRF de l'URL d'image. */
  supabaseHost: string;
}

export interface ExportOutcome {
  cookidoo_recipe_id: string;
  url: string;
  updated: boolean;
  warnings: string[];
  unguided_steps: number[];
}

export type Sleep = (ms: number) => Promise<void>;

/**
 * Détermine si un ré-export peut réutiliser l'identifiant Cookidoo mémorisé.
 *
 * 404 → la recette a été supprimée côté Cookidoo, on la recrée. Toute autre
 * erreur (429, 5xx, réseau) remonte : recréer sur un doute fabriquerait
 * exactement le doublon que ce mécanisme sert à éviter.
 */
async function resolveExistingId(
  ctx: ClientCtx,
  existingId: string | null,
  ops: CookidooOps,
): Promise<string | null> {
  if (!existingId) return null;
  try {
    await ops.getRecipe(ctx, existingId);
    return existingId;
  } catch (lookupErr) {
    if (lookupErr instanceof CookidooHttpError && lookupErr.status === 404) return null;
    throw lookupErr;
  }
}

export async function runExport(
  input: RunExportInput,
  ops: CookidooOps,
  sleep: Sleep,
): Promise<ExportOutcome> {
  const { ctx, payload, imageUrl, supabaseHost } = input;
  const warnings: string[] = [];

  const existingId = await resolveExistingId(ctx, input.existingId, ops);

  let id: string;
  if (existingId) {
    id = existingId;
    // Le champ de renommage en PATCH n'est pas confirmé (endpoints
    // non-officiels) → best-effort : un échec ne doit pas empêcher la mise à
    // jour du contenu.
    try {
      await ops.renameRecipe(ctx, id, payload.name);
      await sleep(2000);
    } catch (renameErr) {
      console.error("[run-export] rename", renameErr);
      warnings.push("title_not_updated");
    }
    await ops.fillRecipe(ctx, id, payload);
  } else {
    id = await ops.createRecipe(ctx, payload.name);
    await sleep(5000); // Cookidoo exige un délai avant les PATCH de remplissage
    try {
      await ops.fillRecipe(ctx, id, payload);
    } catch (fillErr) {
      // Rollback best-effort : ne pas laisser une recette vide sur Cookidoo.
      try {
        await ops.deleteRecipe(ctx, id);
      } catch {
        throw new PartialCreateError(id, fillErr);
      }
      throw fillErr; // rollback OK → échec classé normalement, sans résidu
    }
  }

  // Image : best-effort — un échec n'invalide pas l'export.
  if (imageUrl) {
    try {
      await sleep(2000);
      await ops.uploadRecipeImage(ctx, id, imageUrl, supabaseHost);
    } catch (imgErr) {
      console.error("[run-export] image", imgErr);
      warnings.push("image_not_transferred");
    }
  } else {
    warnings.push("no_image");
  }

  // Contrôle du guided cooking : l'API accepte des annotations qu'elle dégrade
  // ensuite en simple texte, sans erreur HTTP (cf. docs/COOKIDOO-CONTRAT.md §8).
  // La vue « appareil » est le seul endroit où ce silence devient visible.
  let unguided: number[] = [];
  const expectedGuided = payload.instructions
    .map((step, i) => (step.annotations.some((a) => a.type !== "INGREDIENT") ? i : -1))
    .filter((i) => i >= 0);
  if (expectedGuided.length > 0) {
    try {
      await sleep(2000);
      unguided = await ops.findUnguidedSteps(ctx, id, expectedGuided);
      if (unguided.length > 0) {
        console.error(`[run-export] étapes non guidées sur l'appareil : ${unguided.join(", ")}`);
        warnings.push("steps_not_guided");
      }
    } catch (checkErr) {
      // Contrôle best-effort : son échec ne remet pas en cause l'export.
      console.error("[run-export] contrôle guided cooking", checkErr);
    }
  }

  return {
    cookidoo_recipe_id: id,
    url: ops.recipeWebUrl(ctx, id),
    updated: existingId !== null,
    warnings,
    unguided_steps: unguided,
  };
}
