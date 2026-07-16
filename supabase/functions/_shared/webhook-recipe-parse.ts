import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// Schéma de la recette extraite par le LLM (webhook-recipe). Données externes
// non fiables : on valide la structure, avec un repli défensif si le modèle
// s'écarte du format attendu.
export const ExtractedRecipeSchema = z.object({
  title: z.string(),
  servings: z.number().nullable().optional(),
  ingredients: z.array(z.object({
    name: z.string(),
    quantity: z.number().nullable().optional(),
    unit: z.string().nullable().optional(),
  })),
  steps: z.array(z.object({
    order: z.number(),
    text: z.string(),
  })),
  season: z.string().nullable().optional(),
  nutrition_tags: z.array(z.string()).optional(),
});

export interface NormalizedStep {
  order: number;
  text: string;
}

export interface NormalizedWebhookRecipe {
  title: string;
  servings: number | null;
  ingredients: unknown[];
  steps: NormalizedStep[];
  season: string | null;
  nutrition_tags: string[] | null;
}

export type WebhookRecipeParseResult =
  | { ok: true; recipe: NormalizedWebhookRecipe }
  | { ok: false; error: string };

/**
 * Normalise les étapes : accepte les chaînes brutes, les objets `{ instruction }`
 * (sans `text`) et les objets `{ order, text }`. Renvoie toujours des
 * `{ order, text }` avec un ordre croissant à défaut d'ordre explicite.
 */
export function normalizeSteps(steps: unknown): NormalizedStep[] {
  if (!Array.isArray(steps)) return [];
  return steps.map((step, index) => {
    if (typeof step === "string") {
      return { order: index + 1, text: step };
    }
    const s = step as { order?: number; text?: string; instruction?: string };
    if (s.instruction && !s.text) {
      return { order: s.order || index + 1, text: s.instruction };
    }
    return { order: s.order || index + 1, text: s.text || "" };
  });
}

/**
 * Parse et normalise la sortie brute du LLM (webhook-recipe) :
 * 1. retire d'éventuelles clôtures markdown, puis `JSON.parse` (échec → `ok:false`) ;
 * 2. normalise les étapes ;
 * 3. valide contre `ExtractedRecipeSchema` ; en cas d'échec, applique un repli
 *    défensif (titre par défaut, `servings` repris de `portions`, tableaux
 *    neutralisés) plutôt que d'écrire des données malformées en base.
 */
export function parseWebhookRecipe(aiContent: string): WebhookRecipeParseResult {
  let extracted: Record<string, unknown>;
  try {
    const cleanJson = aiContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    extracted = JSON.parse(cleanJson);
  } catch {
    return { ok: false, error: "Failed to parse AI response" };
  }

  if (Array.isArray(extracted.steps)) {
    extracted.steps = normalizeSteps(extracted.steps);
  }

  const validation = ExtractedRecipeSchema.safeParse(extracted);
  if (validation.success) {
    return { ok: true, recipe: validation.data as unknown as NormalizedWebhookRecipe };
  }

  return {
    ok: true,
    recipe: {
      title: (extracted.title as string) || "Recette sans titre",
      servings: (extracted.servings as number | null) ?? (extracted.portions as number | null) ?? null,
      ingredients: Array.isArray(extracted.ingredients) ? extracted.ingredients : [],
      steps: Array.isArray(extracted.steps) ? (extracted.steps as NormalizedStep[]) : [],
      season: (extracted.season as string | null) || null,
      nutrition_tags: Array.isArray(extracted.nutrition_tags) ? (extracted.nutrition_tags as string[]) : null,
    },
  };
}
