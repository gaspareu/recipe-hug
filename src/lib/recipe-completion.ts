import { supabase } from '@/integrations/supabase/client';
import type { Ingredient, Step } from '@/types/recipe';

/** Champs nécessaires pour compléter une recette sans écraser la saisie. */
export interface CompletionSource {
  title: string;
  ingredients: Ingredient[];
  steps: Step[];
  ai_summary: string | null;
  calorie_score: number | null;
  nutrition_tags: string[] | null;
  season: string | null;
}

interface AnalyzeResult {
  ai_summary?: string | null;
  nutrition_tags?: string[] | null;
  calorie_score?: number | null;
  season?: string | null;
}

/**
 * Complète en tâche de fond la description, les tags, la saison et le score
 * calorique d'une recette nouvellement créée, sans écraser les champs déjà saisis.
 * Best-effort : toute erreur est avalée (console.warn), la recette reste valide.
 */
export async function triggerRecipeCompletion(
  recipeId: string,
  current: CompletionSource,
  onUpdated: () => void | Promise<unknown>,
): Promise<void> {
  try {
    const { data, error } = await supabase.functions.invoke('analyze-recipe', {
      body: { title: current.title, ingredients: current.ingredients, steps: current.steps },
    });

    if (error || !data) {
      console.warn('Recipe completion: analyze-recipe failed', error);
      return;
    }

    const analysis = data as AnalyzeResult;
    const patch: Record<string, unknown> = {};

    if (!current.ai_summary?.trim() && analysis.ai_summary) {
      patch.ai_summary = analysis.ai_summary;
    }
    if (current.calorie_score == null && analysis.calorie_score != null) {
      patch.calorie_score = analysis.calorie_score;
    }
    if (!current.nutrition_tags?.length && analysis.nutrition_tags?.length) {
      patch.nutrition_tags = analysis.nutrition_tags;
    }
    if (!current.season && analysis.season) {
      patch.season = analysis.season;
    }

    if (Object.keys(patch).length === 0) return;

    const { error: updateError } = await supabase
      .from('recipes')
      .update(patch)
      .eq('id', recipeId);

    if (updateError) {
      console.warn('Recipe completion: update failed', updateError);
      return;
    }

    await onUpdated();
  } catch (err) {
    console.warn('Recipe completion error:', err);
  }
}
