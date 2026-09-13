import { BookOpen, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { recipeBookSearch, type RecipeBookFilters } from '@/lib/recipe-book-filters';
import type { Recipe } from '@/types/recipe';
import { RecipeIndexRow } from './RecipeIndexRow';

interface RecipeIndexProps {
  recipes: Recipe[];
  totalRecipes: number;
  filters: RecipeBookFilters;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onToggleFavorite: (id: string, isFavorite: boolean) => void;
  isTogglingFavorite?: boolean;
}

export function RecipeIndex({ recipes, totalRecipes, filters, isLoading, isError, onRetry, onToggleFavorite, isTogglingFavorite }: RecipeIndexProps) {
  const search = recipeBookSearch(filters);

  if (isLoading) return <div className="space-y-0" aria-label="Chargement des recettes">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-[73px] rounded-none border-t" />)}</div>;
  if (isError) return <div className="py-16 text-center"><p>Le livre n’a pas pu être chargé.</p><Button className="mt-4" onClick={onRetry}>Réessayer</Button></div>;
  if (totalRecipes === 0) return <div className="flex flex-col items-center py-16 text-center"><BookOpen className="h-8 w-8 text-[hsl(var(--book-organize))]" aria-hidden="true" /><h2 className="mt-4 font-solitreo text-xl">Votre livre est vide</h2><p className="mt-1 max-w-sm text-sm text-[hsl(var(--book-ink)/0.72)]">Ajoutez une recette manuellement ou depuis une photo.</p><Button asChild className="mt-5"><Link to={`/recipes/new${search}`}><Plus className="mr-2 h-4 w-4" />Ajouter une recette</Link></Button></div>;
  if (recipes.length === 0) return <div className="py-16 text-center"><BookOpen className="mx-auto h-8 w-8 text-[hsl(var(--book-organize))]" aria-hidden="true" /><h2 className="mt-4 font-solitreo text-xl">Aucun résultat</h2><p className="mt-1 text-sm text-[hsl(var(--book-ink)/0.72)]">Modifiez ou réinitialisez les filtres du livre.</p></div>;

  return <ul aria-label="Index des recettes">{recipes.map((recipe, index) => <RecipeIndexRow key={recipe.id} recipe={recipe} position={index + 1} filters={filters} onToggleFavorite={onToggleFavorite} isTogglingFavorite={isTogglingFavorite} />)}</ul>;
}
