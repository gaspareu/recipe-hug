import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { RouteError } from './RouteError';
import { isChunkLoadError } from '@/lib/chunk-error';

function renderWithRouteError(error: unknown) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <div>contenu</div>,
        loader: () => {
          throw error;
        },
        errorElement: <RouteError />,
      },
    ],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('isChunkLoadError', () => {
  it('détecte les erreurs de chunk (Chrome/Firefox/Safari)', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: /assets/x.js'))).toBe(true);
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
  });

  it("ignore les erreurs classiques", () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe('RouteError', () => {
  it('affiche un écran de récupération avec Actualiser et Accueil', async () => {
    renderWithRouteError(new Error('boom'));
    expect(await screen.findByText('Une erreur est survenue')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Actualiser/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Accueil/i })).toBeInTheDocument();
  });

  it('affiche un message « nouvelle version » sur ChunkLoadError', async () => {
    renderWithRouteError(new Error('Failed to fetch dynamically imported module: /assets/Home-abc.js'));
    expect(await screen.findByText('Nouvelle version disponible')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Actualiser/i })).toBeInTheDocument();
  });
});
