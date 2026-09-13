import { describe, expect, it } from 'vitest';
import type { Recipe } from '@/types/recipe';
import {
  DEFAULT_RECIPE_BOOK_FILTERS,
  filterAndSortRecipes,
  hasBookContext,
  parseRecipeBookFilters,
  recipeBookSearch,
} from './recipe-book-filters';

const recipes: Recipe[] = [
  { id: 'b', title: 'Tarte été', status: 'draft', is_favorite: false, servings: 4, ingredients: [{ name: 'Pomme', quantity: 1, unit: '' }], steps: [], season: 'été', nutrition_tags: null, calorie_score: null, ai_summary: 'Dessert', source_type: 'manual', source_image_url: null, user_id: 'u', created_at: '2026-01-01', updated_at: '2026-01-02' },
  { id: 'a', title: 'Abricot', status: 'validated', is_favorite: true, servings: 2, ingredients: [{ name: 'Sucre', quantity: 1, unit: '' }], steps: [], season: 'toutes saisons', nutrition_tags: null, calorie_score: null, ai_summary: null, source_type: 'manual', source_image_url: null, user_id: 'u', created_at: '2026-01-01', updated_at: '2026-01-03' },
];

describe('recipe-book-filters', () => {
  it('normalise les paramètres inconnus et omet les valeurs par défaut', () => {
    expect(parseRecipeBookFilters(new URLSearchParams('season=inconnue&status=nope&sort=old&favorites=oui'))).toEqual(DEFAULT_RECIPE_BOOK_FILTERS);
    expect(recipeBookSearch({ ...DEFAULT_RECIPE_BOOK_FILTERS, q: 'tarte', favorites: true })).toBe('?q=tarte&favorites=1');
  });

  it('conserve la recherche, filtre la saison et ne mute jamais la source', () => {
    const source = [...recipes];
    expect(filterAndSortRecipes(recipes, { ...DEFAULT_RECIPE_BOOK_FILTERS, season: 'été' }).map(recipe => recipe.id)).toEqual(['a', 'b']);
    expect(filterAndSortRecipes(recipes, { ...DEFAULT_RECIPE_BOOK_FILTERS, q: 'pomme' }).map(recipe => recipe.id)).toEqual(['b']);
    expect(recipes).toEqual(source);
  });

  it('reconnaît seulement un contexte valide non par défaut', () => {
    expect(hasBookContext(new URLSearchParams('season=été'))).toBe(true);
    expect(hasBookContext(new URLSearchParams('season=inconnue'))).toBe(false);
  });
});
