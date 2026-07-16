import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAsyncAction } from './useAsyncAction';
import { toast } from '@/components/ui/sonner';

vi.mock('@/components/ui/sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe('useAsyncAction', () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('affiche un toast d\'erreur (variante rouge) en cas d\'échec', async () => {
    const { result } = renderHook(() =>
      useAsyncAction(async () => {
        throw new Error('boom');
      }, { errorMessage: 'Échec' }),
    );
    await act(async () => {
      await result.current.run();
    });
    expect(toast.error).toHaveBeenCalledWith('Échec');
    expect(toast.success).not.toHaveBeenCalled();
    expect(result.current.isPending).toBe(false);
    expect(result.current.showLoader).toBe(false);
  });

  it('utilise le message de l\'erreur si aucun errorMessage fourni', async () => {
    const { result } = renderHook(() =>
      useAsyncAction(async () => {
        throw new Error('détail technique');
      }),
    );
    await act(async () => {
      await result.current.run();
    });
    expect(toast.error).toHaveBeenCalledWith('détail technique');
  });

  it('affiche un toast de succès (variante verte) optionnel', async () => {
    const { result } = renderHook(() =>
      useAsyncAction(async () => undefined, { successMessage: 'OK' }),
    );
    await act(async () => {
      await result.current.run();
    });
    expect(toast.success).toHaveBeenCalledWith('OK');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('n\'affiche pas de loader pour une action instantanée (anti-flicker)', async () => {
    const { result } = renderHook(() =>
      useAsyncAction(async () => undefined, { loaderDelayMs: 300 }),
    );
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.showLoader).toBe(false);
  });

  it('passe isPending à true pendant l\'action', async () => {
    let resolveFn: () => void = () => {};
    const pending = new Promise<void>((r) => {
      resolveFn = r;
    });
    const { result } = renderHook(() => useAsyncAction(() => pending));
    act(() => {
      result.current.run();
    });
    await waitFor(() => expect(result.current.isPending).toBe(true));
    await act(async () => {
      resolveFn();
      await pending;
    });
    await waitFor(() => expect(result.current.isPending).toBe(false));
  });
});
