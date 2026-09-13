import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Recipe } from '@/types/recipe';
import { DEFAULT_RECIPE_BOOK_FILTERS } from '@/lib/recipe-book-filters';
import { RecipeIndex } from './RecipeIndex';

const recipe = (id: string, image: string | null): Recipe => ({ id, title: `Recette ${id}`, status: 'draft', is_favorite: false, servings: 2, ingredients: [], steps: [], season: 'été', nutrition_tags: null, calorie_score: null, ai_summary: null, source_type: 'manual', source_image_url: image, user_id: 'u', created_at: '2026-01-01', updated_at: '2026-01-01' });

describe('RecipeIndex', () => {
  it('met une miniature aux positions 1, 4, 7 et conserve des liens non imbriqués', () => {
    render(<MemoryRouter><RecipeIndex recipes={[recipe('1', '/one.jpg'), recipe('2', '/two.jpg'), recipe('3', '/three.jpg'), recipe('4', '/four.jpg')]} totalRecipes={4} filters={{ ...DEFAULT_RECIPE_BOOK_FILTERS, season: 'été' }} onToggleFavorite={vi.fn()} /></MemoryRouter>);
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(screen.getByRole('link', { name: /Recette 1/ })).toHaveAttribute('href', '/recipes/1?season=%C3%A9t%C3%A9');
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });
});
