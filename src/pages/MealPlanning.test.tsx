import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import MealPlanning from './MealPlanning';

const fixtures = vi.hoisted(() => ({ recipes: [] as unknown[], compositions: [] as unknown[], entries: [{
  id: 'repas-1', day_of_week: 0, meal_type: 'lunch', recipe_id: 'recette-1', composition_id: null as string | null,
  recipe_title: 'Soupe de légumes', custom_meal: null, notes: null,
}] }));
vi.mock('@/hooks/useRecipes', () => ({ useRecipes: () => ({ data: fixtures.recipes }) }));
vi.mock('@/hooks/useCompositions', () => ({ useCompositions: () => ({ data: fixtures.compositions }) }));
vi.mock('@/hooks/useMealPlans', () => ({
  useMealPlans: () => ({
    data: {
      entries: fixtures.entries,
      recipesMap: { 'recette-1': { id: 'recette-1', title: 'Soupe de légumes', ingredients: [] } },
    },
    isLoading: false,
  }),
  useAddMealPlan: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteMealPlan: () => ({ mutateAsync: vi.fn() }),
}));

describe('Planning repas — navigation accessible', () => {
  beforeEach(() => {
    fixtures.recipes = [];
    fixtures.compositions = [];
    fixtures.entries = [{ id: 'repas-1', day_of_week: 0, meal_type: 'lunch', recipe_id: 'recette-1', composition_id: null, recipe_title: 'Soupe de légumes', custom_meal: null, notes: null }];
  });
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

  it('déplie les ingrédients d’un plat composé dans les courses', async () => {
    fixtures.recipes = [{
      id: 'carottes', title: 'Carottes', servings: 2,
      ingredients: [{ name: 'Carotte', quantity: 100, unit: 'g' }],
      steps: [{ order: 1, text: 'Cuire' }],
    }];
    fixtures.compositions = [{
      id: 'plat-1', kind: 'dish', title: 'Carottes rôties', servings: 4, assembly_steps: [],
      items: [{ id: 'item-1', position: 0, recipe_id: 'carottes', child_composition_id: null, quantity_factor: 1.5, course: null }],
    }];
    fixtures.entries = [{ id: 'repas-2', day_of_week: 0, meal_type: 'lunch', recipe_id: null, composition_id: 'plat-1', recipe_title: '', custom_meal: null, notes: null }];
    const user = userEvent.setup();
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/meal-planning']}>
      <Routes><Route path="/meal-planning" element={<MealPlanning />} /><Route path="/compositions/:id" element={<h1>Plat ouvert</h1>} /></Routes>
    </MemoryRouter></QueryClientProvider>);
    expect(screen.getByRole('link', { name: 'Carottes rôties' })).toHaveAttribute('href', '/compositions/plat-1');
    await user.click(screen.getByRole('button', { name: 'Ouvrir la liste de courses' }));
    expect(screen.getByText('Carotte')).toBeInTheDocument();
    expect(screen.getByText('300 g')).toBeInTheDocument();
  });
});
