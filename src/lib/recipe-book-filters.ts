import type { Recipe, RecipeStatus } from '@/types/recipe';

export const BOOK_SEASONS = ['printemps', 'été', 'automne', 'hiver'] as const;
export type RecipeBookSeason = (typeof BOOK_SEASONS)[number] | 'all';
export type RecipeBookSort = 'recent' | 'alpha' | 'favorites';

export interface RecipeBookFilters {
  q: string;
  season: RecipeBookSeason;
  status: RecipeStatus | 'all';
  favorites: boolean;
  sort: RecipeBookSort;
}

export const DEFAULT_RECIPE_BOOK_FILTERS: RecipeBookFilters = {
  q: '',
  season: 'all',
  status: 'all',
  favorites: false,
  sort: 'recent',
};

const BOOK_STATUSES: RecipeStatus[] = ['draft', 'tested', 'validated', 'archived'];
const BOOK_SORTS: RecipeBookSort[] = ['recent', 'alpha', 'favorites'];

function isBookSeason(value: string | null): value is RecipeBookSeason {
  return value === 'all' || (value !== null && BOOK_SEASONS.includes(value as (typeof BOOK_SEASONS)[number]));
}

function isBookStatus(value: string | null): value is RecipeStatus | 'all' {
  return value === 'all' || (value !== null && BOOK_STATUSES.includes(value as RecipeStatus));
}

function isBookSort(value: string | null): value is RecipeBookSort {
  return value !== null && BOOK_SORTS.includes(value as RecipeBookSort);
}

/** Lit uniquement les valeurs connues : une URL ancienne ou manuelle reste sûre. */
export function parseRecipeBookFilters(params: URLSearchParams): RecipeBookFilters {
  const season = params.get('season');
  const status = params.get('status');
  const sort = params.get('sort');

  return {
    q: params.get('q') ?? DEFAULT_RECIPE_BOOK_FILTERS.q,
    season: isBookSeason(season) ? season : DEFAULT_RECIPE_BOOK_FILTERS.season,
    status: isBookStatus(status) ? status : DEFAULT_RECIPE_BOOK_FILTERS.status,
    favorites: params.get('favorites') === '1',
    sort: isBookSort(sort) ? sort : DEFAULT_RECIPE_BOOK_FILTERS.sort,
  };
}

/** Sérialise un état normalisé sans bruit dans l'URL. */
export function serializeRecipeBookFilters(filters: RecipeBookFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.season !== DEFAULT_RECIPE_BOOK_FILTERS.season) params.set('season', filters.season);
  if (filters.status !== DEFAULT_RECIPE_BOOK_FILTERS.status) params.set('status', filters.status);
  if (filters.favorites) params.set('favorites', '1');
  if (filters.sort !== DEFAULT_RECIPE_BOOK_FILTERS.sort) params.set('sort', filters.sort);
  return params;
}

export function recipeBookSearch(filters: RecipeBookFilters): string {
  const serialized = serializeRecipeBookFilters(filters).toString();
  return serialized ? `?${serialized}` : '';
}

/** Un contexte existe seulement si l'URL porte une facette valide non par défaut. */
export function hasBookContext(params: URLSearchParams): boolean {
  const filters = parseRecipeBookFilters(params);
  return filters.q !== ''
    || filters.season !== DEFAULT_RECIPE_BOOK_FILTERS.season
    || filters.status !== DEFAULT_RECIPE_BOOK_FILTERS.status
    || filters.favorites
    || filters.sort !== DEFAULT_RECIPE_BOOK_FILTERS.sort;
}

function compareRecent(a: Recipe, b: Recipe): number {
  const updatedDifference = Date.parse(b.updated_at) - Date.parse(a.updated_at);
  if (Number.isFinite(updatedDifference) && updatedDifference !== 0) return updatedDifference;
  return a.id.localeCompare(b.id, 'fr');
}

/**
 * Source unique de filtrage et de tri du livre. Elle travaille toujours sur une
 * copie afin de ne jamais muter le cache TanStack Query.
 */
export function filterAndSortRecipes(recipes: readonly Recipe[], filters: RecipeBookFilters): Recipe[] {
  const query = filters.q.trim().toLocaleLowerCase('fr');

  const filtered = recipes.filter((recipe) => {
    if (query) {
      const matchesTitle = recipe.title.toLocaleLowerCase('fr').includes(query);
      const matchesSummary = recipe.ai_summary?.toLocaleLowerCase('fr').includes(query) ?? false;
      const matchesIngredient = recipe.ingredients.some((ingredient) =>
        ingredient.name.toLocaleLowerCase('fr').includes(query),
      );
      if (!matchesTitle && !matchesSummary && !matchesIngredient) return false;
    }

    if (filters.status !== 'all' && recipe.status !== filters.status) return false;
    if (filters.favorites && !recipe.is_favorite) return false;
    if (
      filters.season !== 'all'
      && recipe.season !== filters.season
      && recipe.season !== 'toutes saisons'
    ) return false;
    return true;
  });

  return [...filtered].sort((a, b) => {
    if (filters.sort === 'recent') return compareRecent(a, b);
    if (filters.sort === 'favorites') {
      if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
      return compareRecent(a, b);
    }

    const titleDifference = a.title.localeCompare(b.title, 'fr');
    if (titleDifference !== 0) return titleDifference;
    return compareRecent(a, b);
  });
}
