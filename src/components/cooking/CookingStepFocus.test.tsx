import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CookingStepFocus } from './CookingStepFocus';
import type { Step } from '@/types/recipe';

const step: Step = { order: 2, text: 'Faites cuire 6 min puis égouttez.' };

describe('CookingStepFocus', () => {
  it('affiche la progression et le numéro d’étape', () => {
    render(<CookingStepFocus step={step} idx={1} total={6} onStartTimer={vi.fn()} />);
    expect(screen.getByText('Étape 2 sur 6')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('surligne la durée détectée dans le texte', () => {
    render(<CookingStepFocus step={step} idx={1} total={6} onStartTimer={vi.fn()} />);
    const duration = screen.getByText('6 min');
    expect(duration.tagName).toBe('STRONG');
  });

  it('propose un minuteur pré-réglé qui démarre avec le bon nombre de secondes', () => {
    const onStartTimer = vi.fn();
    render(<CookingStepFocus step={step} idx={1} total={6} onStartTimer={onStartTimer} />);
    fireEvent.click(screen.getByRole('button', { name: /Minuteur 6:00/ }));
    expect(onStartTimer).toHaveBeenCalledWith('Étape 2', 360);
  });

  it('propose un minuteur depuis duration_minutes même sans durée dans le texte', () => {
    const onStartTimer = vi.fn();
    const structured: Step = { order: 1, text: 'Laissez reposer la pâte.', duration_minutes: 30 };
    render(<CookingStepFocus step={structured} idx={0} total={3} onStartTimer={onStartTimer} />);
    fireEvent.click(screen.getByRole('button', { name: /Minuteur 30:00/ }));
    expect(onStartTimer).toHaveBeenCalledWith('Étape 1', 1800);
  });
});
