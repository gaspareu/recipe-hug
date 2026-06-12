import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, BookOpen } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImageGallery } from '@/components/ui/image-gallery';
import { FilterBar } from '@/components/recipes/FilterBar';
import { FilterBadge } from '@/components/ui/filter-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useRecipes, useToggleFavorite } from '@/hooks/useRecipes';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import type { RecipeStatus } from '@/types/recipe';

const STATUS_LABELS: Record<RecipeStatus, string> = {
  draft: 'Brouillon',
  tested: 'Testé',
  validated: 'Validé',
  archived: 'Archivé',
};

const SEASON_LABELS: Record<string, string> = {
  printemps: 'Printemps',
  été: 'Été',
  automne: 'Automne',
  hiver: 'Hiver',
};

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
  const [sortBy, setSortBy] = useState<'recent' | 'alpha' | 'favorites'>('recent');

  const filteredRecipes = useMemo(() => {
    if (!recipes) return [];
    
    return recipes.filter((recipe) => {
      // Recherche par titre, résumé et ingrédients
      if (search) {
        const q = search.toLowerCase();
        const matchesTitle = recipe.title.toLowerCase().includes(q);
        const matchesSummary = recipe.ai_summary?.toLowerCase().includes(q) ?? false;
        const matchesIngredient = (recipe.ingredients as Array<{ name?: string }>)?.some(i => i.name?.toLowerCase().includes(q)) ?? false;
        if (!matchesTitle && !matchesSummary && !matchesIngredient) return false;
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
    }).sort((a, b) => {
      if (sortBy === 'alpha') return a.title.localeCompare(b.title);
      if (sortBy === 'favorites') {
        if (a.is_favorite && !b.is_favorite) return -1;
        if (!a.is_favorite && b.is_favorite) return 1;
        return 0;
      }
      // recent: ordre de la liste (supposé trié par created_at desc côté serveur)
      return 0;
    });
  }, [recipes, search, statusFilter, favoritesOnly, seasonFilter, sortBy]);

  const handleToggleFavorite = (id: string, isFavorite: boolean) => {
    toggleFavorite.mutate({ id, is_favorite: isFavorite });
  };

  const hasActiveFilters = statusFilter !== 'all' || favoritesOnly || seasonFilter !== 'all' || search;

  return (
    <MainLayout>
      <div 
        className="space-y-4" 
        {...swipeHandlers} 
        style={swipeStyle}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-solitreo font-bold text-foreground">Mes Recettes</h1>
            <p className="text-muted-foreground">
              {filteredRecipes.length} sur {recipes?.length || 0} recette{(recipes?.length || 0) !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={sortBy} onValueChange={v => setSortBy(v as 'recent' | 'alpha' | 'favorites')}>
              <SelectTrigger className="w-auto text-sm h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Plus récentes</SelectItem>
                <SelectItem value="alpha">A-Z</SelectItem>
                <SelectItem value="favorites">Favoris en tête</SelectItem>
              </SelectContent>
            </Select>
            <Button asChild>
              <Link to="/home">
                <Plus className="mr-2 h-4 w-4" />
                Nouvelle
              </Link>
            </Button>
          </div>
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

        {/* Active Filters Display */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2">
            {search && (
              <FilterBadge
                variant="pill"
                label="Recherche"
                value={search}
                onRemove={() => setSearch('')}
              />
            )}
            {statusFilter !== 'all' && (
              <FilterBadge
                variant="pill"
                label="Statut"
                value={STATUS_LABELS[statusFilter]}
                onRemove={() => setStatusFilter('all')}
              />
            )}
            {seasonFilter !== 'all' && (
              <FilterBadge
                variant="pill"
                label="Saison"
                value={SEASON_LABELS[seasonFilter]}
                onRemove={() => setSeasonFilter('all')}
              />
            )}
            {favoritesOnly && (
              <FilterBadge
                variant="pill"
                label="Favoris"
                value="Oui"
                onRemove={() => setFavoritesOnly(false)}
              />
            )}
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:gap-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
        ) : filteredRecipes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in-up">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <BookOpen className="h-7 w-7 text-muted-foreground" />
            </div>
            <h2 className="font-solitreo text-lg font-semibold text-foreground">
              {recipes?.length === 0 ? 'Votre livre est vide' : 'Aucun résultat'}
            </h2>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              {recipes?.length === 0
                ? 'Discutez avec Chef pour créer votre première recette.'
                : 'Aucune recette ne correspond à vos filtres. Essayez d’en retirer un.'}
            </p>
            {recipes?.length === 0 && (
              <Button asChild className="mt-5">
                <Link to="/home">
                  <Plus className="mr-2 h-4 w-4" />
                  Créer une recette
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <ImageGallery
            items={filteredRecipes.map((recipe) => ({
              id: recipe.id,
              title: recipe.title,
              imageUrl: recipe.source_image_url,
              isFavorite: recipe.is_favorite ?? false,
            }))}
            onToggleFavorite={handleToggleFavorite}
            isTogglingFavorite={toggleFavorite.isPending}
          />
        )}
      </div>
    </MainLayout>
  );
}