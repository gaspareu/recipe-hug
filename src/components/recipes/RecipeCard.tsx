import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, ListChecks } from 'lucide-react';
import { RecipeStatusBadge } from './RecipeStatusBadge';
import { FavoriteToggle } from './FavoriteToggle';
import type { Recipe } from '@/types/recipe';

interface RecipeCardProps {
  recipe: Recipe;
  onToggleFavorite: (id: string, isFavorite: boolean) => void;
  isTogglingFavorite?: boolean;
}

export function RecipeCard({ recipe, onToggleFavorite, isTogglingFavorite }: RecipeCardProps) {
  return (
    <Link to={`/recipes/${recipe.id}`}>
      <Card className="h-full transition-all hover:shadow-md hover:border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base font-semibold line-clamp-2">
              {recipe.title}
            </CardTitle>
            <FavoriteToggle
              isFavorite={recipe.is_favorite}
              onToggle={() => onToggleFavorite(recipe.id, !recipe.is_favorite)}
              disabled={isTogglingFavorite}
            />
          </div>
          <RecipeStatusBadge status={recipe.status} />
        </CardHeader>
        <CardContent className="pt-2">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {recipe.servings && (
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                <span>{recipe.servings} pers.</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <ListChecks className="h-4 w-4" />
              <span>{recipe.ingredients.length} ingr.</span>
            </div>
          </div>
          {recipe.season && (
            <p className="mt-2 text-xs text-muted-foreground">
              🍂 {recipe.season}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
