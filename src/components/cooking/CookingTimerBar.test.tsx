import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CookingTimerBar } from './CookingTimerBar';
import type { CookingTimer } from '@/hooks/useCookingTimers';

const running: CookingTimer = { id: '1', label: 'Œufs', total: 360, remaining: 357, running: true, done: false };
const finished: CookingTimer = { id: '2', label: 'Champignons', total: 300, remaining: 0, running: false, done: true };

describe('CookingTimerBar', () => {
  it('ne rend rien sans minuteur', () => {
    const { container } = render(<CookingTimerBar timers={[]} onToggle={vi.fn()} onDismiss={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('affiche le label et le temps restant formaté', () => {
    render(<CookingTimerBar timers={[running]} onToggle={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText('Œufs')).toBeInTheDocument();
    expect(screen.getByText('5:57')).toBeInTheDocument();
  });

  it('met en pause un minuteur en marche', () => {
    const onToggle = vi.fn();
    render(<CookingTimerBar timers={[running]} onToggle={onToggle} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Mettre en pause Œufs/ }));
    expect(onToggle).toHaveBeenCalledWith('1');
  });

  it('affiche « Terminé ! » et permet d’arrêter un minuteur fini', () => {
    const onDismiss = vi.fn();
    render(<CookingTimerBar timers={[finished]} onToggle={vi.fn()} onDismiss={onDismiss} />);
    expect(screen.getByText('Terminé !')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Arrêter le minuteur Champignons/ }));
    expect(onDismiss).toHaveBeenCalledWith('2');
  });
});
