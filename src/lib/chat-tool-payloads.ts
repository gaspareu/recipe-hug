import { z } from 'zod';

import type { PendingRecipe, ToolCallAction, ActiveRecipeData } from '@/hooks/useChatEngine';
import type { PreferenceOperation } from '@/lib/preference-operations';

// Validation des payloads d'outils émis par le LLM (via le stream de
// `home-assistant`). Ce sont des données externes non fiables : on valide leur
// STRUCTURE avant de les utiliser (mise en attente d'une recette, écriture des
// préférences). Les schémas restent volontairement tolérants sur les TYPES que
// le modèle produit réellement — la tool definition envoie `quantity` en string
// pour `save_recipe` mais en number pour `extract`/`create`, et plusieurs champs
// sont optionnels/nullables (cf. schémas côté `home-assistant`). Un schéma trop
// strict rejetterait des recettes valides.

const IngredientPayloadSchema = z.object({
  name: z.string().min(1),
  quantity: z.union([z.string(), z.number()]).nullable().optional(),
  unit: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
});

const StepPayloadSchema = z.object({
  order: z.number().optional(),
  text: z.string().min(1),
  duration_minutes: z.number().nullable().optional(),
  parallel_with: z.array(z.number()).optional(),
});

const RecipePayloadSchema = z.object({
  title: z.string().min(1),
  servings: z.number().nullable().optional(),
  ingredients: z.array(IngredientPayloadSchema),
  steps: z.array(StepPayloadSchema),
  // Marqueurs de mise à jour éventuellement portés par le payload : l'assistant
  // peut renvoyer save_recipe avec isUpdate/originalRecipeId (routage UPDATE),
  // et extract/create les positionnent côté hook. On les conserve donc.
  isUpdate: z.boolean().optional(),
  originalRecipeId: z.string().optional(),
  relationToOriginal: z.string().optional(),
});

const PreferenceOperationSchema = z.object({
  operation: z.enum(['add', 'remove', 'set']),
  category: z.enum(['taste_preferences', 'kitchen_equipment', 'culinary_style', 'dietary_constraints']),
  field: z.string().min(1),
  values: z.array(z.string()).optional(),
  value: z.string().nullable().optional(),
});

/**
 * Valide un payload de recette (save_recipe / extract_modified_recipe /
 * create_new_recipe). Retourne `null` si la structure est invalide (l'appelant
 * n'ouvre alors pas de recette en attente) plutôt que de propager des données
 * malformées vers l'UI puis la base.
 */
export function parseRecipePayload(data: unknown): PendingRecipe | null {
  const result = RecipePayloadSchema.safeParse(data);
  if (!result.success) {
    console.error('Payload de recette invalide, ignoré:', result.error.issues);
    return null;
  }
  // `quantity` peut être string (save_recipe) ou number (extract/create) selon
  // la tool definition : on conserve la valeur telle quelle (comportement
  // historique), la validation ne garantit que la structure.
  return result.data as unknown as PendingRecipe;
}

/**
 * Construit la recette « en attente » à partir d'un appel d'outil du LLM
 * (`save_recipe` / `extract_modified_recipe` / `create_new_recipe`). Logique
 * commune à `useHomeChat` et `useRecipeChat` (auparavant dupliquée) :
 * - `save_recipe` : recette telle quelle (peut porter ses propres marqueurs) ;
 * - `extract_modified_recipe` : marquée comme mise à jour de la recette active ;
 * - `create_new_recipe` : porte `relationToOriginal` issu du payload.
 * Retourne `null` si le payload est invalide ou le type d'action non géré
 * (aucune recette n'est alors mise en attente).
 */
export function buildPendingRecipeFromToolCall(
  action: ToolCallAction,
  activeRecipe: ActiveRecipeData | null,
): PendingRecipe | null {
  const recipe = parseRecipePayload(action.data);
  if (!recipe) return null;

  switch (action.type) {
    case 'save_recipe':
      return recipe;
    case 'extract_modified_recipe':
      return { ...recipe, isUpdate: true, originalRecipeId: activeRecipe?.id };
    case 'create_new_recipe':
      return { ...recipe, relationToOriginal: action.data.relation_to_original as string };
    default:
      return null;
  }
}

/**
 * Valide le tableau d'opérations de `update_preferences`. Retourne `null` si le
 * tableau est malformé — l'appelant n'applique alors rien (les préférences sont
 * écrites sans revue humaine, donc on refuse tout lot douteux).
 */
export function parsePreferenceOperations(data: unknown): PreferenceOperation[] | null {
  const result = z.array(PreferenceOperationSchema).safeParse(data);
  if (!result.success) {
    console.error('Opérations de préférences invalides, ignorées:', result.error.issues);
    return null;
  }
  return result.data;
}
