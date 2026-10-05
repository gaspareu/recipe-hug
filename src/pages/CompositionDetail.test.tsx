import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Recipe } from '@/types/recipe';
import type { Composition } from '@/types/livre';

const state = vi.hoisted(() => ({ recipes: [] as Recipe[], compositions: [] as Composition[], loading: false, error: false }));
vi.mock('@/components/layout/MainLayout', () => ({ MainLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/hooks/useRecipes', () => ({ useRecipes: () => ({ data: state.recipes, isLoading: state.loading, isError: state.error }) }));
vi.mock('@/hooks/useCompositions', () => ({
  useComposition: () => ({ data: state.compositions[0], isLoading: false }),
  useCompositions: () => ({ data: state.compositions }),
  useDeleteComposition: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/components/cooking/ComposedCookingMode', () => ({ ComposedCookingMode: ({ target }: { target: { servings: number } }) => <p>Session de {target.servings} portions</p> }));
import CompositionDetail from './CompositionDetail';

beforeEach(() => {
  state.loading = false; state.error = false;
  state.recipes = ['Carottes', 'Riz'].map((title, index) => ({ id: `r${index}`, title, servings: 2, ingredients: [{ name: 'Sel', quantity: 1, unit: 'g' }], steps: [{ order: 1, text: 'Cuire' }] } as Recipe));
  state.compositions = [{ id: 'c1', kind: 'dish', title: 'Carottes et riz', servings: 4, assembly_steps: ['Servir ensemble'], items: [
    { id: 'i1', position: 2, recipe_id: 'r1', quantity_factor: 1, course: null },
    { id: 'i0', position: 1, recipe_id: 'r0', quantity_factor: 1, course: null },
  ] } as Composition];
});
function renderPage() {
  return render(<MemoryRouter initialEntries={['/compositions/c1']}><Routes><Route path="/compositions/:id" element={<CompositionDetail />} /></Routes></MemoryRouter>);
}
it('adapte les quantités globales, affiche le détail et cuisine les mêmes portions', async () => {
  renderPage();
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Portions' }), { target: { value: '6' } });
  expect(screen.getByRole('checkbox', { name: '6 g Sel' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('tab', { name: 'Par préparation' }));
  expect(screen.getAllByRole('checkbox', { name: '3 g Sel' })).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Cuisiner le plat' }));
  expect(screen.getByText('Session de 6 portions')).toBeInTheDocument();
});
it('respecte l’ordre des éléments et identifie les services du menu', () => {
  state.compositions[0].kind = 'menu';
  state.compositions[0].items[1].course = 'Entrée';
  renderPage();
  expect(screen.getByRole('heading', { name: 'Au menu' })).toBeInTheDocument();
  expect(screen.getByText('Entrée')).toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: 'Voir la fiche' }).map(link => link.getAttribute('href'))).toEqual(['/recipes/r0', '/recipes/r1']);
  expect(screen.getByRole('button', { name: 'Cuisiner le menu' })).toBeEnabled();
});
it('distingue le chargement et une fiche inaccessible puis bloque la cuisine', () => {
  state.loading = true;
  const view = renderPage();
  expect(screen.getByRole('status')).toHaveTextContent('Chargement des fiches liées');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  state.loading = false; state.recipes = [];
  view.rerender(<MemoryRouter initialEntries={['/compositions/c1']}><Routes><Route path="/compositions/:id" element={<CompositionDetail />} /></Routes></MemoryRouter>);
  expect(screen.getByRole('alert')).toHaveTextContent('inaccessible');
  expect(screen.getByRole('button', { name: 'Cuisiner le plat' })).toBeDisabled();
});
