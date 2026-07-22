import { renderHook, act } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  startImageGeneration,
  finishImageGeneration,
  useIsGeneratingImage,
} from './imageGenerationStore';

// Nettoyage entre les tests : le store est module-level (état partagé).
afterEach(() => {
  finishImageGeneration('recipe-a');
  finishImageGeneration('recipe-b');
});

describe('imageGenerationStore', () => {
  it('retourne false par défaut', () => {
    const { result } = renderHook(() => useIsGeneratingImage('recipe-a'));
    expect(result.current).toBe(false);
  });

  it('passe à true après startImageGeneration et revient à false après finish', () => {
    const { result } = renderHook(() => useIsGeneratingImage('recipe-a'));

    act(() => startImageGeneration('recipe-a'));
    expect(result.current).toBe(true);

    act(() => finishImageGeneration('recipe-a'));
    expect(result.current).toBe(false);
  });

  it('isole les recettes entre elles', () => {
    const { result: a } = renderHook(() => useIsGeneratingImage('recipe-a'));
    const { result: b } = renderHook(() => useIsGeneratingImage('recipe-b'));

    act(() => startImageGeneration('recipe-a'));
    expect(a.current).toBe(true);
    expect(b.current).toBe(false);
  });

  it('reste idempotent (double start / double finish)', () => {
    const { result } = renderHook(() => useIsGeneratingImage('recipe-a'));

    act(() => {
      startImageGeneration('recipe-a');
      startImageGeneration('recipe-a');
    });
    expect(result.current).toBe(true);

    act(() => {
      finishImageGeneration('recipe-a');
      finishImageGeneration('recipe-a');
    });
    expect(result.current).toBe(false);
  });
});
