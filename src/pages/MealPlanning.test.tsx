import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import MealPlanning from './MealPlanning';

vi.mock('@/hooks/useRecipes', () => ({ useRecipes: () => ({ data: [] }) }));
vi.mock('@/hooks/useMealPlans', () => ({
  useMealPlans: () => ({
    data: {
      entries: [{
        id: 'repas-1',
        day_of_week: 0,
        meal_type: 'lunch',
        recipe_id: 'recette-1',
        recipe_title: 'Soupe de légumes',
        custom_meal: null,
        notes: null,
      }],
      recipesMap: { 'recette-1': { id: 'recette-1', title: 'Soupe de légumes', ingredients: [] } },
    },
    isLoading: false,
  }),
  useAddMealPlan: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteMealPlan: () => ({ mutateAsync: vi.fn() }),
}));

describe('Planning repas — navigation accessible', () => {
  it('ouvre une recette planifiée par un vrai lien et nomme sa suppression', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/meal-planning']}>
          <Routes>
            <Route path="/meal-planning" element={<MealPlanning />} />
            <Route path="/recipes/:id" element={<h1>Recette ouverte</h1>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const link = screen.getByRole('link', { name: 'Soupe de légumes' });
    expect(link).toHaveAttribute('href', '/recipes/recette-1');
    expect(screen.getByRole('button', { name: /Supprimer Déjeuner du Lun .* : Soupe de légumes/ })).toBeInTheDocument();

    await user.click(link);
    expect(screen.getByRole('heading', { name: 'Recette ouverte' })).toBeInTheDocument();
  });
});
