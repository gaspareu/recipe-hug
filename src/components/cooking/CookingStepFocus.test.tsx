import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CookingStepFocus } from './CookingStepFocus';
import type { Step } from '@/types/recipe';

const step: Step = { order: 2, text: 'Faites cuire 6 min puis égouttez.' };

describe('CookingStepFocus', () => {
  it('affiche la progression et le titre dérivé de l’étape', () => {
    render(<CookingStepFocus step={step} idx={1} total={6} onStartTimer={vi.fn()} activeTimer={null} onToggleTimer={vi.fn()} />);
    expect(screen.getByText('Étape 2 sur 6')).toBeInTheDocument();
    expect(screen.getByText('Faites cuire 6 min puis égouttez')).toBeInTheDocument();
  });

  it('surligne la durée détectée dans le texte', () => {
    render(<CookingStepFocus step={step} idx={1} total={6} onStartTimer={vi.fn()} activeTimer={null} onToggleTimer={vi.fn()} />);
    const duration = screen.getByText('6 min');
    expect(duration.tagName).toBe('STRONG');
  });

  it('propose un minuteur pré-réglé qui démarre avec le bon nombre de secondes', () => {
    const onStartTimer = vi.fn();
    render(<CookingStepFocus step={step} idx={1} total={6} onStartTimer={onStartTimer} activeTimer={null} onToggleTimer={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Minuteur 6:00/ }));
    expect(onStartTimer).toHaveBeenCalledWith('Étape 2', 360);
  });

  it('propose un minuteur depuis duration_minutes même sans durée dans le texte', () => {
    const onStartTimer = vi.fn();
    const structured: Step = { order: 1, text: 'Laissez reposer la pâte.', duration_minutes: 30 };
    render(<CookingStepFocus step={structured} idx={0} total={3} onStartTimer={onStartTimer} activeTimer={null} onToggleTimer={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Minuteur 30:00/ }));
    expect(onStartTimer).toHaveBeenCalledWith('Étape 1', 1800);
  });

  const titled: Step = { order: 1, text: 'Faire cuire 6 min à la casserole.', title: 'Cuire les œufs', duration_minutes: 6 };

  it('affiche le titre court de l’étape quand il est présent', () => {
    render(<CookingStepFocus step={titled} idx={0} total={3} onStartTimer={vi.fn()} activeTimer={null} onToggleTimer={vi.fn()} />);
    expect(screen.getByText('Cuire les œufs')).toBeInTheDocument();
  });

  it('affiche le gros compte à rebours + pause quand un minuteur de l’étape tourne', () => {
    const activeTimer = { id: 't1', label: 'Étape 1', total: 360, remaining: 300, running: true, done: false };
    render(<CookingStepFocus step={titled} idx={0} total={3} onStartTimer={vi.fn()} activeTimer={activeTimer} onToggleTimer={vi.fn()} />);
    expect(screen.getByText('5:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mettre en pause/i })).toBeInTheDocument();
  });

  it('propose « reprendre » quand le minuteur de l’étape est en pause', () => {
    const paused = { id: 't1', label: 'Étape 1', total: 360, remaining: 300, running: false, done: false };
    const onToggleTimer = vi.fn();
    render(<CookingStepFocus step={titled} idx={0} total={3} onStartTimer={vi.fn()} activeTimer={paused} onToggleTimer={onToggleTimer} />);
    fireEvent.click(screen.getByRole('button', { name: /reprendre/i }));
    expect(onToggleTimer).toHaveBeenCalledWith('t1');
  });
});
