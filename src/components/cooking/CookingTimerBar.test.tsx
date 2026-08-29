import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CookingTimerBar } from './CookingTimerBar';
import type { CookingTimer } from '@/hooks/useCookingTimers';

const running: CookingTimer = { id: '1', label: 'Œufs', total: 360, remaining: 357, running: true, done: false, stepIndex: 0 };
const finished: CookingTimer = { id: '2', label: 'Champignons', total: 300, remaining: 0, running: false, done: true, stepIndex: 1 };

describe('CookingTimerBar', () => {
  const renderBar = (timers: CookingTimer[]) => render(
    <CookingTimerBar
      timers={timers}
      servings={3}
      onOpenIngredients={vi.fn()}
      onToggle={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );

  it('affiche toujours l’accès compact aux portions', () => {
    renderBar([]);
    expect(screen.getByRole('button', { name: 'Ajuster les quantités pour 3 portions' })).toBeInTheDocument();
  });

  it('affiche le label et le temps restant formaté', () => {
    renderBar([running]);
    expect(screen.getByText('Œufs')).toBeInTheDocument();
    expect(screen.getByText('5:57')).toBeInTheDocument();
  });

  it('affiche deux minuteurs simultanément dans la même bande', () => {
    renderBar([running, { ...running, id: '3', label: 'Étape 2', remaining: 268, stepIndex: 1 }]);
    expect(screen.getByText('5:57')).toBeInTheDocument();
    expect(screen.getByText('4:28')).toBeInTheDocument();
    expect(screen.getByText('3 portions')).toBeInTheDocument();
  });

  it('met en pause un minuteur en marche', () => {
    const onToggle = vi.fn();
    render(<CookingTimerBar timers={[running]} servings={3} onOpenIngredients={vi.fn()} onToggle={onToggle} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Mettre en pause Œufs/ }));
    expect(onToggle).toHaveBeenCalledWith('1');
  });

  it('affiche « Terminé ! » et permet d’arrêter un minuteur fini', () => {
    const onDismiss = vi.fn();
    render(<CookingTimerBar timers={[finished]} servings={3} onOpenIngredients={vi.fn()} onToggle={vi.fn()} onDismiss={onDismiss} />);
    expect(screen.getByText('Terminé')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Arrêter le minuteur Champignons/ }));
    expect(onDismiss).toHaveBeenCalledWith('2');
  });
});
