import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useRecipes', () => ({
  useRecipes: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useToggleFavorite: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/components/layout/MainLayout', () => ({
  MainLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/layout/BookPageFrame', () => ({
  BookPageFrame: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/recipes/RecipeIndex', () => ({ RecipeIndex: () => null }));

import Dashboard from './Dashboard';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

describe('Dashboard', () => {
  it('réinitialise tous les paramètres du livre en une seule action', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/dashboard?q=tomate&season=hiver&status=draft&favorites=1&sort=alpha']}>
        <Routes>
          <Route path="/dashboard" element={<><Dashboard /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Réinitialiser les filtres' }));

    expect(screen.getByTestId('location')).toHaveTextContent(/^\/dashboard$/);
  });
});
