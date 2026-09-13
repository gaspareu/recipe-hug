import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppBookmarkRail } from './AppBookmarkRail';

describe('AppBookmarkRail', () => {
  it.each(['/dashboard', '/recipes/new', '/recipes/abc', '/recipes/abc/edit'])('marque Livre actif sur %s', (route) => {
    render(<MemoryRouter initialEntries={[route]}><AppBookmarkRail /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Livre' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByRole('link', { current: 'page' })).toHaveLength(1);
  });

  it('empile le libellé actif sous son icône dans une colonne de 44 px', () => {
    render(<MemoryRouter initialEntries={['/home']}><AppBookmarkRail viewportHeight="app" /></MemoryRouter>);
    expect(screen.getAllByRole('link')).toHaveLength(4);
    expect(screen.getByRole('link', { name: 'Chef' })).toHaveClass('h-[104px]', 'flex-col', 'w-11');
    expect(screen.getByText('Chef')).toHaveClass('bookmark-rail-label');
  });

  it('suit le décalage du viewport visuel sur Home', () => {
    render(<MemoryRouter initialEntries={['/home']}><AppBookmarkRail viewportHeight="app" /></MemoryRouter>);

    expect(screen.getByRole('navigation', { name: 'Navigation principale' })).toHaveClass(
      'top-[var(--app-vh-top,0px)]',
    );
  });
});
