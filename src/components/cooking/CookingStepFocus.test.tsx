import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CookingStepFocus } from './CookingStepFocus';
import type { Step } from '@/types/recipe';

const step: Step = { order: 2, text: 'Faites cuire 6 min puis égouttez.' };

const defaultProps = {
  ingredients: [],
  hasActiveTimer: false,
};

describe('CookingStepFocus', () => {
  it('affiche la progression et le titre dérivé de l’étape', () => {
    render(<CookingStepFocus {...defaultProps} step={step} idx={1} total={6} onStartTimer={vi.fn()} />);
    expect(screen.getByText('Étape 2 sur 6')).toBeInTheDocument();
    expect(screen.getByText('Faites cuire 6 min puis égouttez')).toBeInTheDocument();
  });

  it('surligne la durée détectée dans le texte', () => {
    render(<CookingStepFocus {...defaultProps} step={step} idx={1} total={6} onStartTimer={vi.fn()} />);
    const duration = screen.getByText('6 min');
    expect(duration.tagName).toBe('STRONG');
  });

  it('propose un minuteur pré-réglé qui démarre avec le bon nombre de secondes', () => {
    const onStartTimer = vi.fn();
    render(<CookingStepFocus {...defaultProps} step={step} idx={1} total={6} onStartTimer={onStartTimer} />);
    fireEvent.click(screen.getByRole('button', { name: /Minuteur 6:00/ }));
    expect(onStartTimer).toHaveBeenCalledWith('Étape 2', 360, 1);
  });

  it('propose un minuteur depuis duration_minutes même sans durée dans le texte', () => {
    const onStartTimer = vi.fn();
    const structured: Step = { order: 1, text: 'Laissez reposer la pâte.', duration_minutes: 30 };
    render(<CookingStepFocus {...defaultProps} step={structured} idx={0} total={3} onStartTimer={onStartTimer} />);
    fireEvent.click(screen.getByRole('button', { name: /Minuteur 30:00/ }));
    expect(onStartTimer).toHaveBeenCalledWith('Étape 1', 1800, 0);
  });

  const titled: Step = { order: 1, text: 'Faire cuire 6 min à la casserole.', title: 'Cuire les œufs', duration_minutes: 6 };

  it('affiche le titre court de l’étape quand il est présent', () => {
    render(<CookingStepFocus {...defaultProps} step={titled} idx={0} total={3} onStartTimer={vi.fn()} />);
    expect(screen.getByText('Cuire les œufs')).toBeInTheDocument();
  });

  it('ne repropose pas de minuteur quand l’étape en possède déjà un', () => {
    render(<CookingStepFocus {...defaultProps} step={titled} idx={0} total={3} onStartTimer={vi.fn()} hasActiveTimer />);
    expect(screen.queryByRole('button', { name: /Minuteur 6:00/ })).not.toBeInTheDocument();
  });

  it('insère les quantités dans le texte sans bloc d’ingrédients redondant', () => {
    const ingredientStep: Step = {
      order: 1,
      title: 'Cuire les œufs',
      text: 'Faire cuire les œufs avec le beurre 6 min.',
    };
    render(
      <CookingStepFocus
        {...defaultProps}
        step={ingredientStep}
        idx={0}
        total={3}
        ingredients={[
          { name: 'Œufs', quantity: 4, unit: '' },
          { name: 'Beurre', quantity: 20, unit: 'g' },
        ]}
        onStartTimer={vi.fn()}
      />,
    );

    expect(screen.getByText('(4)')).toBeInTheDocument();
    expect(screen.getByText('(20 g)')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pour cette étape' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Voir tous les ingrédients/ })).not.toBeInTheDocument();
  });

  it('remplace une quantité déjà écrite au lieu de montrer deux valeurs', () => {
    render(
      <CookingStepFocus
        {...defaultProps}
        step={{ order: 1, text: 'Ajouter 200 g de farine.' }}
        idx={0}
        total={1}
        ingredients={[{ name: 'Farine', quantity: 300, unit: 'g' }]}
        onStartTimer={vi.fn()}
      />,
    );

    expect(screen.queryByText(/200 g/)).not.toBeInTheDocument();
    expect(screen.getByText('300 g')).toBeInTheDocument();
    expect(screen.getAllByText(/de farine/)).toHaveLength(2);
  });

  it('remplace aussi le nombre des ingrédients comptés sans afficher « pièce »', () => {
    render(
      <CookingStepFocus
        {...defaultProps}
        step={{ order: 1, text: 'Ajouter 2 œufs.' }}
        idx={0}
        total={1}
        ingredients={[{ name: 'Œufs', quantity: 3, unit: 'pièce' }]}
        onStartTimer={vi.fn()}
      />,
    );

    expect(screen.queryByText(/2 œufs/)).not.toBeInTheDocument();
    expect(screen.queryByText(/pièce/)).not.toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('conserve le pluriel de l’unité déjà employé dans la phrase', () => {
    render(
      <CookingStepFocus
        {...defaultProps}
        step={{ order: 1, text: 'Ajouter 2 gousses d’ail.' }}
        idx={0}
        total={1}
        ingredients={[{ name: 'Ail', quantity: 3, unit: 'gousse' }]}
        onStartTimer={vi.fn()}
      />,
    );

    expect(screen.queryByText(/2 gousses/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /3 gousses d’ail/ })).toBeInTheDocument();
    expect(screen.getByText('3 gousses')).toBeInTheDocument();
  });

  it('garde un rappel compact pour les ingrédients associés mais non cités', () => {
    render(
      <CookingStepFocus
        {...defaultProps}
        step={{ order: 1, text: 'Ajouter les ingrédients secs.' }}
        idx={0}
        total={1}
        ingredients={[
          { name: 'Farine', quantity: 300, unit: 'g' },
          { name: 'Sucre', quantity: 80, unit: 'g' },
        ]}
        onStartTimer={vi.fn()}
      />,
    );

    expect(screen.getByText('À prévoir :')).toBeInTheDocument();
    expect(screen.getByText(/300 g/)).toBeInTheDocument();
    expect(screen.getByText(/80 g/)).toBeInTheDocument();
  });

  it('ne répète pas un ingrédient dont la quantité est déjà remplacée dans le titre', () => {
    render(
      <CookingStepFocus
        {...defaultProps}
        step={{ order: 1, title: 'Ajouter 200 g de farine', text: 'Mélanger les ingrédients secs.' }}
        idx={0}
        total={1}
        ingredients={[{ name: 'Farine', quantity: 300, unit: 'g' }]}
        onStartTimer={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Ajouter 300 g de farine' })).toBeInTheDocument();
    expect(screen.queryByText('À prévoir :')).not.toBeInTheDocument();
  });
});
