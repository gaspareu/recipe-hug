import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as recipeHooks from '@/hooks/useRecipes';
import { DEFAULT_RECIPE_BOOK_FILTERS, filterAndSortRecipes, hasBookContext, parseRecipeBookFilters, recipeBookSearch } from '@/lib/recipe-book-filters';
import type { Recipe } from '@/types/recipe';

export interface RecipeBookNavigation {
  previous: Recipe | null;
  next: Recipe | null;
  search: string;
  hasContext: boolean;
}

export function getRecipeBookNavigation(recipes: readonly Recipe[], currentRecipeId: string, params: URLSearchParams): RecipeBookNavigation {
  const hasContext = hasBookContext(params);
  const filters = hasContext ? parseRecipeBookFilters(params) : DEFAULT_RECIPE_BOOK_FILTERS;
  const ordered = filterAndSortRecipes(recipes, filters);
  const index = ordered.findIndex((recipe) => recipe.id === currentRecipeId);

  if (index === -1) return { previous: null, next: null, search: hasContext ? recipeBookSearch(filters) : '', hasContext };
  return {
    previous: ordered[index - 1] ?? null,
    next: ordered[index + 1] ?? null,
    search: hasContext ? recipeBookSearch(filters) : '',
    hasContext,
  };
}

/** Feuilletage strictement aligné sur l'index et ses paramètres normalisés. */
export function useRecipeBookNavigation(currentRecipeId: string): RecipeBookNavigation {
  // Les environnements de test de fiche peuvent ne mocker que useRecipe ; le
  // feuilletage devient alors simplement indisponible, sans casser la lecture.
  const recipesQuery = recipeHooks.useRecipes?.();
  const recipes = recipesQuery?.data;
  const [searchParams] = useSearchParams();
  return useMemo(
    () => getRecipeBookNavigation(recipes ?? [], currentRecipeId, searchParams),
    [currentRecipeId, recipes, searchParams],
  );
}
