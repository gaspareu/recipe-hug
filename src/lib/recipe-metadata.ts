import { supabase } from '@/integrations/supabase/client';
import type { PendingRecipe } from '@/hooks/useChatEngine';
import { parseGeneratedPairingProfile } from '../../supabase/functions/_shared/recipe-metadata';

/** Les métadonnées facultatives restent absentes sur les anciennes propositions. */
export function recipeMetadataPatch(recipe: PendingRecipe) {
  return {
    ...(recipe.entry_kind !== undefined ? { entry_kind: recipe.entry_kind } : {}),
    ...(recipe.ai_summary !== undefined ? { ai_summary: recipe.ai_summary } : {}),
    ...(recipe.season !== undefined ? { season: recipe.season } : {}),
    ...(recipe.nutrition_tags !== undefined ? { nutrition_tags: recipe.nutrition_tags } : {}),
    ...(recipe.calorie_score !== undefined ? { calorie_score: recipe.calorie_score } : {}),
  };
}

/** La complétion préserve un profil existant ; une modification explicite le régénère. */
export async function saveGeneratedPairingProfile(recipeId: string, value: unknown, replaceExisting = false) {
  const profile = parseGeneratedPairingProfile(value);
  if (!profile) return;
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw authError ?? new Error('Non authentifié');
  const { error } = await supabase.from('recipe_pairing_profiles').upsert({
    ...profile, recipe_id: recipeId, user_id: user.id,
    allergen_review_state: 'unknown', dietary_review_state: 'unknown',
  }, { onConflict: 'recipe_id', ignoreDuplicates: !replaceExisting });
  if (error) throw error;
}

/** Une ancienne revue alimentaire ne doit jamais valider de nouveaux ingrédients. */
export async function invalidatePairingProfileReview(recipeId: string) {
  const { error } = await supabase.from('recipe_pairing_profiles').update({
    allergen_review_state: 'unknown', dietary_review_state: 'unknown',
  }).eq('recipe_id', recipeId);
  if (error) throw error;
}
