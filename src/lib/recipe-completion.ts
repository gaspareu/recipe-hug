import { supabase } from '@/integrations/supabase/client';
import { saveGeneratedPairingProfile } from './recipe-metadata';
import type { GeneratedPairingProfile } from '../../supabase/functions/_shared/recipe-metadata';
import type { Ingredient, Step, RecipeEntryKind } from '@/types/recipe';

/** Champs nécessaires pour compléter une recette sans écraser la saisie. */
export interface CompletionSource {
  updated_at: string;
  entry_kind?: RecipeEntryKind | null;
  pairing_profile?: GeneratedPairingProfile;
  title: string;
  ingredients: Ingredient[];
  steps: Step[];
  ai_summary: string | null;
  calorie_score: number | null;
  nutrition_tags: string[] | null;
  season: string | null;
}

interface AnalyzeResult {
  entry_kind?: RecipeEntryKind;
  pairing_profile?: GeneratedPairingProfile;
  ai_summary?: string | null;
  nutrition_tags?: string[] | null;
  calorie_score?: number | null;
  season?: string | null;
}

/** Champs descriptifs patchables d'une recette (sous-ensemble du type Update). */
interface RecipePatch {
  entry_kind?: RecipeEntryKind;
  ai_summary?: string;
  calorie_score?: number;
  nutrition_tags?: string[];
  season?: string;
}

/**
 * Complète en tâche de fond le classement, le profil d’accords, la description,
 * les tags, la saison et le score calorique d'une recette nouvellement créée, sans écraser les champs déjà saisis.
 * Best-effort : toute erreur est avalée (console.warn), la recette reste valide.
 */
export async function triggerRecipeCompletion(
  recipeId: string,
  current: CompletionSource,
  onUpdated: () => void | Promise<unknown>,
): Promise<void> {
  try {
    if (current.entry_kind && current.ai_summary?.trim() && current.season && current.nutrition_tags?.length && current.calorie_score != null && current.pairing_profile) {
      await saveGeneratedPairingProfile(recipeId, current.pairing_profile);
      await onUpdated();
      return;
    }
    const { data, error } = await supabase.functions.invoke('analyze-recipe', {
      body: { title: current.title, ingredients: current.ingredients, steps: current.steps },
    });

    if (error || !data) {
      console.warn('Recipe completion: analyze-recipe failed', error);
      return;
    }

    const analysis = data as AnalyzeResult;
    const patch: RecipePatch = {};
    if (!current.entry_kind && (analysis.entry_kind === 'preparation' || analysis.entry_kind === 'complete_dish')) {
      patch.entry_kind = analysis.entry_kind;
    }

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

    const profile = current.pairing_profile ?? analysis.pairing_profile;
    if (Object.keys(patch).length === 0 && !profile) return;
    // Sans version du contenu analysé, aucune écriture tardive n'est fiable.
    if (!current.updated_at) return;
    const { data: updated, error: updateError } = await supabase
      .from('recipes')
      .update(Object.keys(patch).length ? patch : { updated_at: current.updated_at })
      .eq('id', recipeId)
      .eq('updated_at', current.updated_at)
      .select('id')
      .maybeSingle();

    if (updateError) {
      console.warn('Recipe completion: update failed', updateError);
      return;
    }

    // Zéro ligne signifie qu'une modification plus récente a gagné la course.
    if (!updated) return;
    try { await saveGeneratedPairingProfile(recipeId, profile); }
    catch (error) { console.warn('Profil généré non enregistré :', error); }
    await onUpdated();
  } catch (err) {
    console.warn('Recipe completion error:', err);
  }
}
