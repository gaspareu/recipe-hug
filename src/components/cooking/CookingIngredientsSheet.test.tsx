import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CookingIngredientsSheet } from './CookingIngredientsSheet';

describe('CookingIngredientsSheet', () => {
  it('affiche les quantités ajustées et permet de cocher un ingrédient', () => {
    const onToggleIngredient = vi.fn();
    render(
      <CookingIngredientsSheet
        open
        onOpenChange={vi.fn()}
        servings={6}
        ingredients={[
          { name: 'Farine', quantity: 300, unit: 'g' },
          { name: 'Œufs', quantity: 3, unit: '' },
        ]}
        checkedIndexes={new Set([1])}
        onToggleIngredient={onToggleIngredient}
      />,
    );

    expect(screen.getByText('Quantités pour 6 portions')).toBeInTheDocument();
    expect(screen.getByText('300 g')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Œufs/ })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: /Farine/ }));
    expect(onToggleIngredient).toHaveBeenCalledWith(0);
  });
});
