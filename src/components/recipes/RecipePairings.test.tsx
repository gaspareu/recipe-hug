import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Recipe } from '@/types/recipe';
const state = vi.hoisted(() => ({ error: false }));
vi.mock('@/hooks/useRecipes', () => ({ useRecipes: () => ({ data: Array.from({ length: 4 }, (_, index) => ({ id: `r${index}`, title: `Accord ${index}` })) }) }));
vi.mock('@/hooks/usePairings', () => ({
  usePairingRecommendations: () => ({ data: Array.from({ length: 4 }, (_, index) => ({ recipeId: `r${index}`, reason: 'Apporte de la fraîcheur' })), isError: state.error, isPending: false }),
  usePairingFeedback: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
import { RecipePairings } from './RecipePairings';
it('borne les accords et ouvre le composeur avec les portions sans enregistrer', () => {
  state.error = false;
  render(<MemoryRouter><RecipePairings recipe={{ id: 'base', entry_kind: 'preparation' } as Recipe} servings={6} /></MemoryRouter>);
  const choices = screen.getAllByRole('link', { name: 'Choisir' });
  expect(choices).toHaveLength(3);
  expect(choices[0]).toHaveAttribute('href', '/compositions/new?kind=dish&recipes=base%2Cr0&servings=6');
  expect(screen.getByRole('link', { name: 'Composer un plat…' })).toBeInTheDocument();
});
it('propose le choix manuel même quand les suggestions échouent pour un plat complet', () => {
  state.error = true;
  render(<MemoryRouter><RecipePairings recipe={{ id: 'base', entry_kind: 'complete_dish' } as Recipe} /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: 'Ajouter un accompagnement' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Choisir un accompagnement…' })).toBeInTheDocument();
});
