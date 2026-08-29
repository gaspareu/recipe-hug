import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_SAFE_AREA_BOTTOM_VAR,
  APP_VIEWPORT_HEIGHT_VAR,
  APP_VIEWPORT_TOP_VAR,
  useViewportHeight,
} from './useViewportHeight';

/** Double de `window.visualViewport` : jsdom ne l'implémente pas. */
class FakeVisualViewport extends EventTarget {
  height = 852;
  offsetTop = 0;

  /** Simule le clavier : la zone visible rétrécit et iOS décale le viewport visuel. */
  emitResize(height: number, offsetTop = this.offsetTop) {
    this.height = height;
    this.offsetTop = offsetTop;
    this.dispatchEvent(new Event('resize'));
  }

  /** Simule le défilement du viewport visuel sous le viewport de mise en page. */
  emitScroll(offsetTop: number) {
    this.offsetTop = offsetTop;
    this.dispatchEvent(new Event('scroll'));
  }
}

const readVar = (name: string) => document.documentElement.style.getPropertyValue(name);

/** Vide la file `requestAnimationFrame` simulée par les faux timers. */
const flushFrames = () => vi.advanceTimersByTime(16);

describe('useViewportHeight', () => {
  let viewport: FakeVisualViewport;

  beforeEach(() => {
    vi.useFakeTimers();
    viewport = new FakeVisualViewport();
    vi.stubGlobal('visualViewport', viewport);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.documentElement.removeAttribute('style');
  });

  it('publie la hauteur visible et le décalage dès le montage', () => {
    renderHook(() => useViewportHeight());

    expect(readVar(APP_VIEWPORT_HEIGHT_VAR)).toBe('852px');
    expect(readVar(APP_VIEWPORT_TOP_VAR)).toBe('0px');
  });

  it('réduit la hauteur à l’ouverture du clavier', () => {
    renderHook(() => useViewportHeight());

    viewport.emitResize(516);
    flushFrames();

    expect(readVar(APP_VIEWPORT_HEIGHT_VAR)).toBe('516px');
    expect(readVar(APP_SAFE_AREA_BOTTOM_VAR)).toBe('0px');
  });

  it('conserve la safe-area quand le clavier est fermé', () => {
    renderHook(() => useViewportHeight());

    expect(readVar(APP_SAFE_AREA_BOTTOM_VAR)).toBe('');

    viewport.emitResize(700);
    flushFrames();

    expect(readVar(APP_SAFE_AREA_BOTTOM_VAR)).toBe('');
  });

  it('suit le décalage du viewport visuel quand iOS fait défiler la page', () => {
    renderHook(() => useViewportHeight());

    viewport.emitScroll(336);
    flushFrames();

    // Sans cette compensation, la coquille `position: fixed` reste collée au
    // viewport de mise en page et sort de l'écran (chat « tout en haut »).
    expect(readVar(APP_VIEWPORT_TOP_VAR)).toBe('336px');
  });

  it('relit la hauteur après la fin de l’animation du clavier', () => {
    renderHook(() => useViewportHeight());

    // iOS émet un `resize` intermédiaire puis termine l'animation sans en
    // émettre de dernier : la valeur finale n'est lisible qu'ensuite.
    viewport.emitResize(700);
    flushFrames();
    expect(readVar(APP_VIEWPORT_HEIGHT_VAR)).toBe('700px');

    viewport.height = 852;
    vi.advanceTimersByTime(500);

    expect(readVar(APP_VIEWPORT_HEIGHT_VAR)).toBe('852px');
    expect(readVar(APP_SAFE_AREA_BOTTOM_VAR)).toBe('');
  });

  it('nettoie les variables et les écouteurs au démontage', () => {
    const removeSpy = vi.spyOn(viewport, 'removeEventListener');
    const { unmount } = renderHook(() => useViewportHeight());

    unmount();

    expect(readVar(APP_VIEWPORT_HEIGHT_VAR)).toBe('');
    expect(readVar(APP_VIEWPORT_TOP_VAR)).toBe('');
    expect(readVar(APP_SAFE_AREA_BOTTOM_VAR)).toBe('');
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
  });

  it('ne casse pas sans visualViewport', () => {
    vi.stubGlobal('visualViewport', undefined);

    expect(() => renderHook(() => useViewportHeight())).not.toThrow();
    expect(readVar(APP_VIEWPORT_HEIGHT_VAR)).toBe('');
  });
});
