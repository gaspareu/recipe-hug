import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Profiler } from 'react';

// Vérifie expérimentalement le risque de boucle de rendu infinie soulevé
// pendant la revue du plan : l'effet qui notifie le toast final appelle
// `reset()` (non mémoïsé dans useCookidooExport), ce qui remet `exportId` à
// null et fait donc changer `job` → le garde `!job` doit couper la boucle.
// Ce test le prouve en comptant les rendus et les toasts après le succès.

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

vi.mock('@/hooks/useCookidooConnector', () => ({
  useCookidooConnector: () => ({
    status: { data: { configured: true }, isLoading: false },
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ExportToCookidooButton } from './ExportToCookidooButton';

let renderCount = 0;

function renderButton() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  renderCount = 0;
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Profiler id="export-btn" onRender={() => { renderCount += 1; }}>
          <ExportToCookidooButton recipeId="recipe-1" open showTrigger={false} />
        </Profiler>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ExportToCookidooButton — flux asynchrone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("n'émet le toast final qu'une seule fois et ne boucle pas indéfiniment après le succès", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { ok: true, export_id: 'job-1', status: 'pending' },
      error: null,
    } as never);
    maybeSingle
      .mockResolvedValueOnce({ data: { id: 'job-1', status: 'pending' }, error: null })
      .mockResolvedValue({
        data: {
          id: 'job-1',
          status: 'success',
          cookidoo_url: 'https://cookidoo.fr/r/1',
          warnings: [],
          updated: false,
        },
        error: null,
      });

    renderButton();

    const button = screen.getByRole('button', { name: /envoyer la recette/i });
    fireEvent.click(button);

    // Accusé de réception synchrone.
    await waitFor(() => expect(toast.info).toHaveBeenCalledTimes(1));

    // Laisse le polling atteindre le statut final.
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));

    const renderCountAfterSuccess = renderCount;
    const pollCallsAfterSuccess = maybeSingle.mock.calls.length;

    // Si l'effet bouclait (reset() non mémoïsé relançant l'effet en boucle),
    // on verrait ici des rendus et/ou des toasts supplémentaires en rafale.
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });

    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
    expect(maybeSingle.mock.calls.length).toBe(pollCallsAfterSuccess); // pas de polling résiduel
    // Tolérance faible pour les rendus de stabilisation React (jamais une
    // rafale illimitée caractéristique d'une boucle).
    expect(renderCount).toBeLessThanOrEqual(renderCountAfterSuccess + 2);
  });
});
