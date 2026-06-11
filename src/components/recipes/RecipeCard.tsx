import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Leaf } from 'lucide-react';
import { RecipeStatusBadge } from './RecipeStatusBadge';
import { FavoriteToggle } from './FavoriteToggle';
import type { Recipe } from '@/types/recipe';

import placeholderLivre from '@/assets/placeholder_livre.jpg';
import placeholderSalade from '@/assets/placeholder_salade.jpg';
import placeholderPlat from '@/assets/placeholder_plat.jpg';

const placeholderImages = [placeholderLivre, placeholderSalade, placeholderPlat];

function getPlaceholderImage(id: string): string {
  // Use recipe id to consistently pick the same image for each recipe
  const index = id.charCodeAt(0) % placeholderImages.length;
  return placeholderImages[index];
}

interface RecipeCardProps {
  recipe: Recipe;
  onToggleFavorite: (id: string, isFavorite: boolean) => void;
  isTogglingFavorite?: boolean;
}

function getSeasonGradient(season: string | null): string {
  switch (season?.toLowerCase()) {
    case 'printemps':
      return 'var(--gradient-spring)';
    case 'été':
      return 'var(--gradient-summer)';
    case 'automne':
      return 'var(--gradient-autumn)';
    case 'hiver':
      return 'var(--gradient-winter)';
    default:
      return 'var(--gradient-default)';
  }
}

function getSeasonIcon(season: string | null): string {
  switch (season?.toLowerCase()) {
    case 'printemps':
      return '🌸';
    case 'été':
      return '☀️';
    case 'automne':
      return '🍂';
    case 'hiver':
      return '❄️';
    default:
      return '🍽️';
  }
}

export function RecipeCard({
  recipe,
  onToggleFavorite,
  isTogglingFavorite
}: RecipeCardProps) {
  return (
    <Link to={`/recipes/${recipe.id}`}>
      <Card className="h-full overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-1 group">
        {/* Image ou placeholder avec gradient saisonnier */}
        <div className="relative h-40 overflow-hidden">
          <img 
            src={getPlaceholderImage(recipe.id)} 
            alt={recipe.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          
          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          
          {/* Bouton favoris en overlay */}
          <div className="absolute top-2 right-2">
            <FavoriteToggle 
              isFavorite={recipe.is_favorite ?? false} 
              onToggle={() => onToggleFavorite(recipe.id, !recipe.is_favorite)} 
              disabled={isTogglingFavorite}
              variant="overlay"
            />
          </div>
        </div>

        <CardHeader className="pb-2 pt-3">
          <CardTitle className="text-base font-solitreo font-semibold line-clamp-2 group-hover:text-primary transition-colors">
            {recipe.title}
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <RecipeStatusBadge status={recipe.status} />
            
            {recipe.servings && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                <span>{recipe.servings}</span>
              </div>
            )}
            
            {recipe.season && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Leaf className="h-3 w-3" />
                <span>{recipe.season}</span>
              </div>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="pt-0 pb-3">
          {recipe.nutrition_tags && recipe.nutrition_tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {recipe.nutrition_tags.slice(0, 3).map(tag => (
                <Badge key={tag} variant="secondary" className="text-xs px-1.5 py-0">
                  {tag}
                </Badge>
              ))}
              {recipe.nutrition_tags.length > 3 && (
                <Badge variant="outline" className="text-xs px-1.5 py-0">
                  +{recipe.nutrition_tags.length - 3}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}