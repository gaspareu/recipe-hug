// Sélection déterministe d'une image placeholder pour une recette sans photo.
// Partagé entre la grille (image-gallery) et la hero (RecipeImageDisplay) pour
// garantir la continuité visuelle du morph shared-element : une recette sans
// image doit afficher le MÊME placeholder dans la vignette et dans la hero.

import placeholderLivre from '@/assets/placeholder_livre.jpg';
import placeholderPlat from '@/assets/placeholder_plat.jpg';
import placeholderSalade from '@/assets/placeholder_salade.jpg';

const placeholders = [placeholderLivre, placeholderPlat, placeholderSalade];

export function getPlaceholderForRecipe(recipeId: string): string {
  let hash = 0;
  for (let i = 0; i < recipeId.length; i++) {
    hash = recipeId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return placeholders[Math.abs(hash) % placeholders.length];
}
