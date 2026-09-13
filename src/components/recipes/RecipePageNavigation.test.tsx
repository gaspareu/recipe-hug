import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Recipe } from '@/types/recipe';
import { RecipePageNavigation } from './RecipePageNavigation';

const recipe: Recipe = { id: 'next', title: 'Recette suivante', status: 'draft', is_favorite: false, servings: null, ingredients: [], steps: [], season: null, nutrition_tags: null, calorie_score: null, ai_summary: null, source_type: 'manual', source_image_url: null, user_id: 'u', created_at: '2026-01-01', updated_at: '2026-01-01' };

describe('RecipePageNavigation', () => {
  it('désactive une extrémité et conserve les paramètres sur le lien', () => {
    render(<MemoryRouter><RecipePageNavigation previous={null} next={recipe} search="?season=%C3%A9t%C3%A9" /></MemoryRouter>);
    expect(screen.getByText('Aucune recette').closest('[aria-disabled]')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('link', { name: /Recette suivante/ })).toHaveAttribute('href', '/recipes/next?season=%C3%A9t%C3%A9');
  });
});
