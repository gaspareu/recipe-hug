import { z } from 'zod';

import type { PendingRecipe, ToolCallAction, ActiveRecipeData } from '@/hooks/useChatEngine';
import type { PreferenceOperation } from '@/lib/preference-operations';

// Validation des payloads d'outils émis par le LLM (via le stream de
// `home-assistant`). Ce sont des données externes non fiables : on valide leur
// STRUCTURE avant de les utiliser (mise en attente d'une recette, écriture des
// préférences). Les schémas acceptent `quantity` en string OU number selon
// l'outil émetteur, mais `parseRecipePayload` coerce toujours la valeur en
// number (string → parseFloat) pour garantir la compatibilité avec le
// recalcul de portions sans branche côté consommateurs. Plusieurs champs
// sont optionnels/nullables (cf. schémas côté `home-assistant`) : un schéma
// trop strict rejetterait des recettes valides.

const IngredientPayloadSchema = z.object({
  name: z.string().min(1),
  quantity: z.union([z.string(), z.number()]).nullable().optional(),
  unit: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  preparation: z.string().nullable().optional(),
});

// Paramètres machine TM7 d'une étape. Volontairement permissif : on valide la
// STRUCTURE, pas les plages — la normalisation stricte (vitesses, températures)
// est faite par le mapper Cookidoo via le référentiel TM7.
const Tm7ParamsPayloadSchema = z.object({
  mode: z.string().optional(),
  seconds: z.number().nullable().optional(),
  temperature: z.union([z.number(), z.string()]).nullable().optional(),
  speed: z.union([z.string(), z.number()]).nullable().optional(),
  reverse: z.boolean().nullable().optional(),
  accessory: z.string().nullable().optional(),
  power: z.string().nullable().optional(),
});

const StepPayloadSchema = z.object({
  order: z.number().optional(),
  text: z.string().min(1),
  duration_minutes: z.number().nullable().optional(),
  parallel_with: z.array(z.number()).optional(),
  tm7: Tm7ParamsPayloadSchema.nullable().optional(),
});

const RecipePayloadSchema = z.object({
  title: z.string().min(1),
  servings: z.number().nullable().optional(),
  ingredients: z.array(IngredientPayloadSchema),
  steps: z.array(StepPayloadSchema),
  // Champs riches pour l'outil propose_recipe (optionnels : absents sur save_recipe).
  intro: z.array(z.string()).optional(),
  introClosing: z.string().optional(),
  /** Forme snake_case émise par la tool def backend (Task 6) — normalisé en introClosing par parseRecipePayload. */
  intro_closing: z.string().optional(),
  tip: z.string().optional(),
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
 * create_new_recipe / propose_recipe). Retourne `null` si la structure est
 * invalide (l'appelant n'ouvre alors pas de recette en attente) plutôt que de
 * propager des données malformées vers l'UI puis la base.
 *
 * Normalisations appliquées :
 * - `intro_closing` (snake_case du backend) est fusionné dans `introClosing` ;
 * - `quantity` est coercé en number (string → parseFloat) pour garantir la
 *   compatibilité avec le recalcul de portions.
 */
export function parseRecipePayload(data: unknown): PendingRecipe | null {
  const result = RecipePayloadSchema.safeParse(data);
  if (!result.success) {
    console.error('Payload de recette invalide, ignoré:', result.error.issues);
    return null;
  }
  const { intro_closing, ...rest } = result.data;
  return {
    ...rest,
    introClosing: rest.introClosing ?? intro_closing,
    ingredients: rest.ingredients.map(ing => ({
      ...ing,
      quantity: typeof ing.quantity === 'string' ? (parseFloat(ing.quantity) || 0) : (ing.quantity ?? 0),
    })),
  } as unknown as PendingRecipe;
}

/**
 * Construit la recette « en attente » à partir d'un appel d'outil du LLM
 * (`propose_recipe` / `save_recipe` / `extract_modified_recipe` / `create_new_recipe`).
 * Logique commune à `useHomeChat` et `useRecipeChat` (auparavant dupliquée) :
 * - `propose_recipe` : recette proposée avec champs riches (intro, astuce) ;
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
    case 'propose_recipe':
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
