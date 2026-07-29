import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCookingTimers, findActiveStepTimer, type CookingTimer } from './useCookingTimers';

describe('useCookingTimers', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('démarre sans aucun minuteur', () => {
    const { result } = renderHook(() => useCookingTimers());
    expect(result.current.timers).toEqual([]);
  });

  it('ajoute un minuteur en marche avec le temps initial', () => {
    const { result } = renderHook(() => useCookingTimers());
    act(() => result.current.addTimer('Œufs', 360, 0));
    expect(result.current.timers).toHaveLength(1);
    expect(result.current.timers[0]).toMatchObject({
      label: 'Œufs', total: 360, remaining: 360, running: true, done: false, stepIndex: 0,
    });
  });

  it('décrémente le temps restant chaque seconde', () => {
    const { result } = renderHook(() => useCookingTimers());
    act(() => result.current.addTimer('Œufs', 360, 0));
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.timers[0].remaining).toBe(357);
  });

  it('marque le minuteur terminé à zéro et appelle onTimerDone une fois', () => {
    const onTimerDone = vi.fn();
    const { result } = renderHook(() => useCookingTimers({ onTimerDone }));
    act(() => result.current.addTimer('Œufs', 2, 0));
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.timers[0]).toMatchObject({ remaining: 0, running: false, done: true });
    act(() => vi.advanceTimersByTime(2000));
    expect(onTimerDone).toHaveBeenCalledTimes(1);
  });

  it('met en pause puis reprend un minuteur', () => {
    const { result } = renderHook(() => useCookingTimers());
    act(() => result.current.addTimer('Œufs', 360, 0));
    const id = result.current.timers[0].id;
    act(() => result.current.toggleTimer(id));
    expect(result.current.timers[0].running).toBe(false);
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.timers[0].remaining).toBe(360);
    act(() => result.current.toggleTimer(id));
    expect(result.current.timers[0].running).toBe(true);
  });

  it('retire un minuteur', () => {
    const { result } = renderHook(() => useCookingTimers());
    act(() => result.current.addTimer('Œufs', 360, 0));
    const id = result.current.timers[0].id;
    act(() => result.current.dismissTimer(id));
    expect(result.current.timers).toEqual([]);
  });
});

describe('findActiveStepTimer', () => {
  const makeTimer = (overrides: Partial<CookingTimer> = {}): CookingTimer => ({
    id: 't1',
    label: 'Étape 1',
    total: 360,
    remaining: 300,
    running: true,
    done: false,
    stepIndex: 0,
    ...overrides,
  });

  it('retourne le minuteur en marche dont le stepIndex correspond', () => {
    const timer = makeTimer({ stepIndex: 1 });
    expect(findActiveStepTimer([timer], 1, false)).toBe(timer);
  });

  it('retourne un minuteur en pause dont le stepIndex correspond', () => {
    const timer = makeTimer({ stepIndex: 1, running: false, done: false });
    expect(findActiveStepTimer([timer], 1, false)).toBe(timer);
  });

  it('exclut les minuteurs terminés', () => {
    const timer = makeTimer({ stepIndex: 1, done: true });
    expect(findActiveStepTimer([timer], 1, false)).toBeNull();
  });

  it('exclut les minuteurs des autres étapes', () => {
    const timer = makeTimer({ stepIndex: 2 });
    expect(findActiveStepTimer([timer], 1, false)).toBeNull();
  });

  it('retourne null quand la session est terminée', () => {
    const timer = makeTimer({ stepIndex: 1 });
    expect(findActiveStepTimer([timer], 1, true)).toBeNull();
  });
});
