import { useCallback, useEffect, useRef, useState } from 'react';

/** Formate un nombre de secondes en `m:ss` (ex : 360 → « 6:00 »). */
export function formatTimer(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

export interface CookingTimer {
  id: string;
  label: string;
  /** Durée totale, en secondes. */
  total: number;
  /** Temps restant, en secondes. */
  remaining: number;
  running: boolean;
  done: boolean;
}

interface UseCookingTimersOptions {
  /** Appelé une fois lorsqu'un minuteur atteint zéro (ex : déclencher une sonnerie). */
  onTimerDone?: (timer: CookingTimer) => void;
}

/**
 * Gère un ensemble de minuteurs de cuisson (plusieurs en parallèle), avec un
 * tick d'une seconde. À zéro, un minuteur passe à `done` et `onTimerDone` est
 * appelé exactement une fois.
 */
export function useCookingTimers({ onTimerDone }: UseCookingTimersOptions = {}) {
  const [timers, setTimers] = useState<CookingTimer[]>([]);

  // onTimerDone lu via ref pour éviter de relancer l'interval à chaque rendu.
  const onTimerDoneRef = useRef(onTimerDone);
  onTimerDoneRef.current = onTimerDone;

  useEffect(() => {
    const interval = setInterval(() => {
      setTimers(prev => {
        let changed = false;
        const next = prev.map(timer => {
          if (!timer.running || timer.done) return timer;
          changed = true;
          if (timer.remaining <= 1) {
            const finished = { ...timer, remaining: 0, running: false, done: true };
            onTimerDoneRef.current?.(finished);
            return finished;
          }
          return { ...timer, remaining: timer.remaining - 1 };
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const addTimer = useCallback((label: string, seconds: number) => {
    setTimers(prev => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        label,
        total: seconds,
        remaining: seconds,
        running: true,
        done: false,
      },
    ]);
  }, []);

  const toggleTimer = useCallback((id: string) => {
    setTimers(prev => prev.map(t => (t.id === id ? { ...t, running: !t.running } : t)));
  }, []);

  const dismissTimer = useCallback((id: string) => {
    setTimers(prev => prev.filter(t => t.id !== id));
  }, []);

  return { timers, addTimer, toggleTimer, dismissTimer };
}
