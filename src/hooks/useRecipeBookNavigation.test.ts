import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import type { Recipe } from '@/types/recipe';

vi.mock('@/hooks/useRecipes', () => ({ useRecipes: () => ({ data: [] }) }));

import { getRecipeBookNavigation } from './useRecipeBookNavigation';

const recipes = ['a', 'b', 'c'].map((id, index): Recipe => ({ id, title: id, status: 'draft', is_favorite: id === 'b', servings: null, ingredients: [], steps: [], season: 'été', nutrition_tags: null, calorie_score: null, ai_summary: null, source_type: 'manual', source_image_url: null, user_id: 'u', created_at: '2026-01-01', updated_at: `2026-01-0${index + 1}` }));

describe('getRecipeBookNavigation', () => {
  it('calcule précédent et suivant dans le même ordre récent', () => {
    const navigation = getRecipeBookNavigation(recipes, 'b', new URLSearchParams());
    expect(navigation.previous?.id).toBe('c');
    expect(navigation.next?.id).toBe('a');
  });

  it('désactive le feuilletage lorsque le filtre exclut la recette affichée', () => {
    const navigation = getRecipeBookNavigation(recipes, 'a', new URLSearchParams('favorites=1'));
    expect(navigation.previous).toBeNull();
    expect(navigation.next).toBeNull();
    expect(navigation.search).toBe('?favorites=1');
  });
});
