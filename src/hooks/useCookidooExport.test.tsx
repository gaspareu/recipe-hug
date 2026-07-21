import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const maybeSingle = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle,
    })),
  },
}));

import { supabase } from '@/integrations/supabase/client';
import { useCookidooExport } from './useCookidooExport';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useCookidooExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('interroge la ligne tant qu’elle est pending, puis s’arrête au statut final', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { ok: true, export_id: 'job-1', status: 'pending' },
      error: null,
    } as never);
    maybeSingle
      .mockResolvedValueOnce({ data: { id: 'job-1', status: 'pending' }, error: null })
      .mockResolvedValue({
        data: { id: 'job-1', status: 'success', cookidoo_url: 'https://cookidoo.fr/r/1', warnings: [] },
        error: null,
      });

    const { result } = renderHook(() => useCookidooExport(), { wrapper });

    await act(async () => {
      await result.current.startExport('recipe-1');
    });

    await waitFor(() => expect(result.current.exportId).toBe('job-1'));

    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    await waitFor(() => expect(result.current.job?.status).toBe('success'));

    const callsAtSuccess = maybeSingle.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    // Le statut est final : plus aucune interrogation ne doit partir.
    expect(maybeSingle.mock.calls.length).toBe(callsAtSuccess);
  });

  it('abandonne l’attente au-delà de deux minutes sur un statut pending', async () => {
    // Un isolate tué avant la fin laisse la ligne pending pour toujours :
    // sans borne, le front interrogerait indéfiniment.
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { ok: true, export_id: 'job-2', status: 'pending' },
      error: null,
    } as never);
    maybeSingle.mockResolvedValue({ data: { id: 'job-2', status: 'pending' }, error: null });

    const { result } = renderHook(() => useCookidooExport(), { wrapper });

    await act(async () => { await result.current.startExport('recipe-2'); });
    await waitFor(() => expect(result.current.exportId).toBe('job-2'));

    await act(async () => { await vi.advanceTimersByTimeAsync(125_000); });

    await waitFor(() => expect(result.current.timedOut).toBe(true));

    const calls = maybeSingle.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(maybeSingle.mock.calls.length).toBe(calls);
  });

  it('remonte un échec synchrone sans lancer d’interrogation', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { ok: false, error: 'invalid_payload', message: 'Recette non exportable : titre vide.' },
      error: null,
    } as never);

    const { result } = renderHook(() => useCookidooExport(), { wrapper });

    let response;
    await act(async () => { response = await result.current.startExport('recipe-3'); });

    expect(response).toMatchObject({ ok: false, error: 'invalid_payload' });
    expect(result.current.exportId).toBeNull();
    expect(maybeSingle).not.toHaveBeenCalled();
  });
});
