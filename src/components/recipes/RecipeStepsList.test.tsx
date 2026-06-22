import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RecipeStepsList } from './RecipeStepsList';
import type { Step } from '@/types/recipe';

describe('RecipeStepsList', () => {
  it('affiche les étapes triées par ordre, numérotées', () => {
    const steps: Step[] = [
      { order: 2, text: 'Mélanger' },
      { order: 1, text: 'Préchauffer' },
    ];
    render(<RecipeStepsList steps={steps} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    // Premier élément = ordre 1 (« Préchauffer »), numéroté 1
    expect(items[0]).toHaveTextContent('1');
    expect(items[0]).toHaveTextContent('Préchauffer');
    expect(items[1]).toHaveTextContent('2');
    expect(items[1]).toHaveTextContent('Mélanger');
  });

  it('affiche un message quand il n’y a aucune étape', () => {
    render(<RecipeStepsList steps={[]} />);
    expect(screen.getByText(/aucune étape/i)).toBeInTheDocument();
  });
});
