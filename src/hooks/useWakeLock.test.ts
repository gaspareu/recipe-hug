import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useWakeLock } from './useWakeLock';

interface FakeSentinel {
  released: boolean;
  release: ReturnType<typeof vi.fn>;
  addEventListener: (type: string, cb: () => void) => void;
  removeEventListener: () => void;
  _fireRelease: () => void;
}

function makeSentinel(): FakeSentinel {
  let onRelease: (() => void) | null = null;
  return {
    released: false,
    release: vi.fn().mockResolvedValue(undefined),
    addEventListener: (type, cb) => { if (type === 'release') onRelease = cb; },
    removeEventListener: () => { onRelease = null; },
    _fireRelease: () => onRelease?.(),
  };
}

function installWakeLock() {
  const sentinels: FakeSentinel[] = [];
  const request = vi.fn().mockImplementation(async () => {
    const s = makeSentinel();
    sentinels.push(s);
    return s;
  });
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true, writable: true });
  return { request, sentinels };
}

function removeWakeLock() {
  Object.defineProperty(navigator, 'wakeLock', { value: undefined, configurable: true, writable: true });
}

describe('useWakeLock', () => {
  afterEach(() => { removeWakeLock(); vi.restoreAllMocks(); });

  it('signale le support quand navigator.wakeLock existe', () => {
    installWakeLock();
    const { result } = renderHook(() => useWakeLock());
    expect(result.current.isSupported).toBe(true);
  });

  it('signale l’absence de support sans planter', async () => {
    removeWakeLock();
    const { result } = renderHook(() => useWakeLock());
    expect(result.current.isSupported).toBe(false);
    await act(async () => { await result.current.request(); });
    expect(result.current.isActive).toBe(false);
  });

  it('acquiert un verrou écran sur request()', async () => {
    const { request } = installWakeLock();
    const { result } = renderHook(() => useWakeLock());
    await act(async () => { await result.current.request(); });
    expect(request).toHaveBeenCalledWith('screen');
    expect(result.current.isActive).toBe(true);
  });

  it('libère le verrou sur release()', async () => {
    const { sentinels } = installWakeLock();
    const { result } = renderHook(() => useWakeLock());
    await act(async () => { await result.current.request(); });
    await act(async () => { await result.current.release(); });
    expect(sentinels[0].release).toHaveBeenCalled();
    expect(result.current.isActive).toBe(false);
  });

  it('réacquiert le verrou au retour de visibilité s’il a été perdu', async () => {
    const { request, sentinels } = installWakeLock();
    const { result } = renderHook(() => useWakeLock());
    await act(async () => { await result.current.request(); });
    expect(request).toHaveBeenCalledTimes(1);

    // Le système relâche le verrou (écran verrouillé / onglet caché).
    act(() => sentinels[0]._fireRelease());
    expect(result.current.isActive).toBe(false);

    // Retour au premier plan → réacquisition automatique.
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.current.isActive).toBe(true);
  });
});
