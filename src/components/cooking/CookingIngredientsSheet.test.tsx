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
        canDecreaseServings
        onDecreaseServings={vi.fn()}
        onIncreaseServings={vi.fn()}
        ingredients={[
          { name: 'Farine', quantity: 300, unit: 'g' },
          { name: 'Œufs', quantity: 3, unit: '' },
        ]}
        checkedIndexes={new Set([1])}
        onToggleIngredient={onToggleIngredient}
      />,
    );

    expect(screen.getByText('6 portions')).toBeInTheDocument();
    expect(screen.getByText('300 g')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Œufs/ })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: /Farine/ }));
    expect(onToggleIngredient).toHaveBeenCalledWith(0);
  });

  it('permet d’ajuster les portions depuis le panneau', () => {
    const onDecreaseServings = vi.fn();
    const onIncreaseServings = vi.fn();
    render(
      <CookingIngredientsSheet
        open
        onOpenChange={vi.fn()}
        servings={3}
        canDecreaseServings
        onDecreaseServings={onDecreaseServings}
        onIncreaseServings={onIncreaseServings}
        ingredients={[]}
        checkedIndexes={new Set()}
        onToggleIngredient={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Diminuer les portions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Augmenter les portions' }));
    expect(onDecreaseServings).toHaveBeenCalledOnce();
    expect(onIncreaseServings).toHaveBeenCalledOnce();
  });
});
