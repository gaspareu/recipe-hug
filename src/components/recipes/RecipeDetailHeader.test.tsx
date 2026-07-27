import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecipeDetailHeader } from './RecipeDetailHeader';

describe('RecipeDetailHeader', () => {
  it('affiche le titre en niveau 1', () => {
    render(<RecipeDetailHeader title="Buddha bowl printanier" description="Un bol complet." />);
    expect(screen.getByRole('heading', { level: 1, name: 'Buddha bowl printanier' })).toBeInTheDocument();
  });

  it('affiche la description quand elle est fournie', () => {
    render(<RecipeDetailHeader title="X" description="Frais et rassasiant." />);
    expect(screen.getByText('Frais et rassasiant.')).toBeInTheDocument();
  });

  it('n’affiche pas de paragraphe de description quand elle est absente', () => {
    const { container } = render(<RecipeDetailHeader title="X" description={null} />);
    expect(container.querySelector('p')).toBeNull();
  });
});
