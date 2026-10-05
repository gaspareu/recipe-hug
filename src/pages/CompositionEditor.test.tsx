import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

const save = vi.hoisted(() => vi.fn().mockResolvedValue('dish-1'));
vi.mock('@/components/layout/MainLayout', () => ({ MainLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/hooks/useRecipes', () => ({ useRecipes: () => ({ data: [
  { id: 'carottes', title: 'Carottes au cumin', status: 'validated', servings: 4 },
  { id: 'riz', title: 'Riz', status: 'validated', servings: 4 },
] }) }));
vi.mock('@/hooks/useCompositions', () => ({
  useComposition: () => ({ data: null, isLoading: false }),
  useCompositions: () => ({ data: [] }),
  useSaveComposition: () => ({ mutateAsync: save, isPending: false }),
}));

import CompositionEditor from './CompositionEditor';

it('préremplit les accords choisis puis enregistre le plat après validation', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/compositions/new?kind=dish&recipes=carottes,riz&servings=6']}>
    <Routes>
      <Route path="/compositions/new" element={<CompositionEditor />} />
      <Route path="/compositions/:id" element={<h1>Plat enregistré</h1>} />
    </Routes>
  </MemoryRouter>);

  await user.type(screen.getByRole('textbox', { name: 'Nom *' }), 'Carottes et riz');
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'dish', title: 'Carottes et riz', servings: 6,
    items: [
      expect.objectContaining({ recipe_id: 'carottes' }),
      expect.objectContaining({ recipe_id: 'riz' }),
    ],
  })));
  expect(await screen.findByRole('heading', { name: 'Plat enregistré' })).toBeInTheDocument();
});
