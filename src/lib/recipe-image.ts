import { supabase } from '@/integrations/supabase/client';
import type { Ingredient } from '@/types/recipe';
import { startImageGeneration, finishImageGeneration } from '@/lib/imageGenerationStore';

interface GenerateRecipeImageArgs {
  recipeId: string;
  title: string;
  ingredients: Ingredient[];
  /** Token de session déjà disponible ; sinon récupéré via `supabase.auth.getSession()`. */
  accessToken?: string;
  /** Callback appelé après une génération réussie (ex: refetch de la liste). */
  onSuccess?: () => void | Promise<unknown>;
}

/**
 * Déclenche la génération d'image d'une recette en arrière-plan (fire-and-forget).
 *
 * Point d'entrée UNIQUE : le suivi de progression (`imageGenerationStore`) est
 * porté nativement ici (start avant l'appel, finish dans un `finally`), donc
 * impossible à oublier pour un futur appelant. Les erreurs sont avalées
 * volontairement — la génération d'image est best-effort et ne doit jamais
 * casser le flux de création de recette.
 */
export async function generateRecipeImageInBackground({
  recipeId, title, ingredients, accessToken, onSuccess,
}: GenerateRecipeImageArgs): Promise<void> {
  startImageGeneration(recipeId);
  try {
    let token = accessToken;
    if (!token) {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token;
    }
    if (!token) return;

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-recipe-image`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ recipeId, title, ingredients }),
      },
    );

    if (response.ok) {
      await onSuccess?.();
    } else {
      console.warn('Image generation failed:', await response.text());
    }
  } catch (error) {
    console.warn('Image generation error:', error);
  } finally {
    finishImageGeneration(recipeId);
  }
}
