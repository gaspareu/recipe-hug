import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { BookPageFrame } from '@/components/layout/BookPageFrame';
import { Button } from '@/components/ui/button';
import { FilterBar } from '@/components/recipes/FilterBar';
import { RecipeIndex } from '@/components/recipes/RecipeIndex';
import { useRecipes, useToggleFavorite } from '@/hooks/useRecipes';
import { DEFAULT_RECIPE_BOOK_FILTERS, filterAndSortRecipes, parseRecipeBookFilters, recipeBookSearch, serializeRecipeBookFilters, type RecipeBookFilters } from '@/lib/recipe-book-filters';

export default function Dashboard() {
  const { data: recipes = [], isLoading, isError, refetch } = useRecipes();
  const toggleFavorite = useToggleFavorite();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseRecipeBookFilters(searchParams), [searchParams]);
  const filteredRecipes = useMemo(() => filterAndSortRecipes(recipes, filters), [recipes, filters]);
  const updateFilters = (next: Partial<RecipeBookFilters>) => setSearchParams(serializeRecipeBookFilters({ ...filters, ...next }), { replace: true });
  const showAll = () => updateFilters({ season: 'all', status: 'all', favorites: false });
  const resetAll = () => setSearchParams(serializeRecipeBookFilters(DEFAULT_RECIPE_BOOK_FILTERS), { replace: true });
  const query = recipeBookSearch(filters);

  return (
    <MainLayout>
      <BookPageFrame className="space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[hsl(var(--book-ink)/0.18)] pb-4">
          <div><h1 className="font-solitreo text-3xl">Mes recettes</h1><p className="mt-1 text-sm text-[hsl(var(--book-ink)/0.72)]">{filteredRecipes.length} sur {recipes.length} recette{recipes.length !== 1 ? 's' : ''}</p></div>
          <Button asChild className="bg-[hsl(var(--book-bookmark))] text-[hsl(var(--book-bookmark-foreground))] hover:bg-[hsl(var(--book-bookmark)/0.85)]"><Link to={`/recipes/new${query}`}><Plus className="mr-2 h-4 w-4" />Ajouter une recette</Link></Button>
        </header>
        <FilterBar search={filters.q} onSearchChange={(q) => updateFilters({ q })} statusFilter={filters.status} onStatusFilterChange={(status) => updateFilters({ status })} favoritesOnly={filters.favorites} onFavoritesOnlyChange={(favorites) => updateFilters({ favorites })} seasonFilter={filters.season} onSeasonFilterChange={(season) => updateFilters({ season: season as RecipeBookFilters['season'] })} sortBy={filters.sort} onSortByChange={(sort) => updateFilters({ sort })} onShowAll={showAll} onClearAll={resetAll} />
        {Boolean(recipeBookSearch(filters)) && <Button type="button" variant="link" className="h-auto px-0 text-[hsl(var(--book-ink))]" onClick={resetAll}>Réinitialiser tous les filtres</Button>}
        <RecipeIndex recipes={filteredRecipes} totalRecipes={recipes.length} filters={filters} isLoading={isLoading} isError={isError} onRetry={() => void refetch()} onToggleFavorite={(id, is_favorite) => toggleFavorite.mutate({ id, is_favorite })} isTogglingFavorite={toggleFavorite.isPending} />
      </BookPageFrame>
    </MainLayout>
  );
}
