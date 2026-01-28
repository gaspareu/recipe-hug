import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { RecipeGridItem } from '@/components/recipes/RecipeGridItem';
import { FilterBar } from '@/components/recipes/FilterBar';
import { Skeleton } from '@/components/ui/skeleton';
import { useRecipes, useToggleFavorite } from '@/hooks/useRecipes';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import type { RecipeStatus } from '@/types/recipe';

export default function Dashboard() {
  // Swipe right to navigate back to chat
  const { handlers: swipeHandlers, style: swipeStyle } = useSwipeNavigation({
    targetRoute: '/',
    direction: 'right',
    threshold: 80,
  });
  const { data: recipes, isLoading } = useRecipes();
  const toggleFavorite = useToggleFavorite();
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RecipeStatus | 'all'>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [seasonFilter, setSeasonFilter] = useState('all');

  const filteredRecipes = useMemo(() => {
    if (!recipes) return [];
    
    return recipes.filter((recipe) => {
      // Recherche par titre
      if (search && !recipe.title.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      // Filtre par statut
      if (statusFilter !== 'all' && recipe.status !== statusFilter) {
        return false;
      }
      // Filtre favoris
      if (favoritesOnly && !recipe.is_favorite) {
        return false;
      }
      // Filtre par saison (inclut aussi "toutes saisons")
      if (seasonFilter !== 'all' && recipe.season !== seasonFilter && recipe.season !== 'toutes saisons') {
        return false;
      }
      return true;
    });
  }, [recipes, search, statusFilter, favoritesOnly, seasonFilter]);

  const handleToggleFavorite = (id: string, isFavorite: boolean) => {
    toggleFavorite.mutate({ id, is_favorite: isFavorite });
  };

  return (
    <MainLayout>
      <div 
        className="space-y-6" 
        {...swipeHandlers} 
        style={swipeStyle}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-playfair font-bold text-foreground">Mes Recettes</h1>
            <p className="text-muted-foreground">
              {filteredRecipes.length} sur {recipes?.length || 0} recette{(recipes?.length || 0) !== 1 ? 's' : ''}
            </p>
          </div>
          <Button asChild>
            <Link to="/home">
              <Plus className="mr-2 h-4 w-4" />
              Nouvelle
            </Link>
          </Button>
        </div>

        <FilterBar
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          favoritesOnly={favoritesOnly}
          onFavoritesOnlyChange={setFavoritesOnly}
          seasonFilter={seasonFilter}
          onSeasonFilterChange={setSeasonFilter}
        />

        {isLoading ? (
          <div className="grid grid-cols-3 gap-0.5 animate-stagger">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="aspect-square rounded-none" />
            ))}
          </div>
        ) : filteredRecipes.length === 0 ? (
          <div className="text-center py-12 animate-fade-in-up">
            <p className="text-muted-foreground">
              {recipes?.length === 0
                ? "Aucune recette pour l'instant. Créez votre première recette !"
                : 'Aucune recette ne correspond à vos filtres.'}
            </p>
            {recipes?.length === 0 && (
              <Button asChild className="mt-4">
                <Link to="/home">
                  <Plus className="mr-2 h-4 w-4" />
                  Créer une recette
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-0.5 animate-stagger">
            {filteredRecipes.map((recipe) => (
              <RecipeGridItem
                key={recipe.id}
                recipe={recipe}
                onToggleFavorite={handleToggleFavorite}
                isTogglingFavorite={toggleFavorite.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}