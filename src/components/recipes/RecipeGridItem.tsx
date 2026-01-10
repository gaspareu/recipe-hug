import { Link } from "react-router-dom";
import { FavoriteToggle } from "./FavoriteToggle";
import type { Recipe } from "@/types/recipe";
import placeholderLivre from "@/assets/placeholder_livre.jpg";
import placeholderSalade from "@/assets/placeholder_salade.jpg";
import placeholderPlat from "@/assets/placeholder_plat.jpg";
const placeholderImages = [placeholderLivre, placeholderSalade, placeholderPlat];
function getPlaceholderImage(id: string): string {
  const index = id.charCodeAt(0) % placeholderImages.length;
  return placeholderImages[index];
}
interface RecipeGridItemProps {
  recipe: Recipe;
  onToggleFavorite: (id: string, isFavorite: boolean) => void;
  isTogglingFavorite?: boolean;
}
export function RecipeGridItem({
  recipe,
  onToggleFavorite,
  isTogglingFavorite
}: RecipeGridItemProps) {
  const imageUrl = recipe.source_image_url || getPlaceholderImage(recipe.id);

  return <Link to={`/recipes/${recipe.id}`} className="relative aspect-square overflow-hidden group">
      {/* Image */}
      <img src={imageUrl} alt={recipe.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />

      {/* Overlay sombre au hover pour améliorer lisibilité */}
      <div className="absolute inset-0 bg-black/10 group-hover:bg-black/30 transition-colors duration-300" />

      {/* Titre centré avec ombre pour lisibilité */}
      <div className="absolute inset-0 flex items-center justify-center p-3">
        <h3 className="text-center font-playfair sm:text-base leading-tight line-clamp-3 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] text-white text-base font-extrabold">
          {recipe.title}
        </h3>
      </div>

      {/* Bouton favoris en overlay (visible au hover) */}
      <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200" onClick={e => e.preventDefault()}>
        <FavoriteToggle isFavorite={recipe.is_favorite ?? false} onToggle={() => onToggleFavorite(recipe.id, !recipe.is_favorite)} disabled={isTogglingFavorite} variant="overlay" />
      </div>
    </Link>;
}