import { Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { FavoriteToggle } from '@/components/recipes/FavoriteToggle';
import { RecipeStatusBadge } from '@/components/recipes/RecipeStatusBadge';
import { recipeBookSearch, type RecipeBookFilters } from '@/lib/recipe-book-filters';
import type { Recipe } from '@/types/recipe';

interface RecipeIndexRowProps {
  recipe: Recipe;
  position: number;
  filters: RecipeBookFilters;
  onToggleFavorite: (id: string, isFavorite: boolean) => void;
  isTogglingFavorite?: boolean;
}

export function RecipeIndexRow({ recipe, position, filters, onToggleFavorite, isTogglingFavorite }: RecipeIndexRowProps) {
  const showThumbnail = (position - 1) % 3 === 0 && Boolean(recipe.source_image_url);
  const search = recipeBookSearch(filters);

  return (
    <li className="flex min-w-0 items-center gap-3 border-t border-[hsl(var(--book-ink)/0.18)] py-3 first:border-t-0">
      <span className="w-7 shrink-0 font-solitreo text-lg tabular-nums text-[hsl(var(--book-organize))]" aria-label={`Recette ${position}`}>{String(position).padStart(2, '0')}</span>
      <div className="h-12 w-16 shrink-0 overflow-hidden">
        {showThumbnail && <img className="h-full w-full object-cover" src={recipe.source_image_url!} alt={`Aperçu de ${recipe.title}`} />}
      </div>
      <Link to={`/recipes/${recipe.id}${search}`} className="min-w-0 flex-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--book-accent))]">
        <p className="truncate font-medium text-[hsl(var(--book-ink))]">{recipe.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[hsl(var(--book-ink)/0.72)]">
          {recipe.season && <span className="capitalize">{recipe.season}</span>}
          {recipe.servings && <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" aria-hidden="true" />{recipe.servings}</span>}
          <RecipeStatusBadge status={recipe.status} />
        </div>
      </Link>
      <FavoriteToggle isFavorite={recipe.is_favorite} onToggle={() => onToggleFavorite(recipe.id, !recipe.is_favorite)} disabled={isTogglingFavorite} />
    </li>
  );
}
