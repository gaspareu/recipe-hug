import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
import { supabase } from '@/integrations/supabase/client';
import { useCookidooExport } from './useCookidooExport';
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
}
const adaptation = { id: 'a1', status: 'ready', confirmation: { token: 'signed', expires_at: 100000 }, recipe: { title: 'Pain' } };
const ready = { ok: true, adaptation, job: null, has_destination: true };
describe('useCookidooExport', () => {
  beforeEach(() => vi.clearAllMocks());
  it('refuse un ancien backend avant toute action de préparation', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { capabilities: ['tm7_preparation_v1'] }, error: null } as never);
    const { result } = renderHook(() => useCookidooExport('r1'), { wrapper });
    await waitFor(() => expect(result.current.unavailable).toBe(true));
    await act(async () => { await expect(result.current.prepare.mutateAsync({})).rejects.toThrow('backend_updating'); });
    expect(supabase.functions.invoke).toHaveBeenCalledExactlyOnceWith('export-recipe-cookidoo', { method: 'GET' });
  });
  it('retrouve une copie persistée après ouverture et envoie son identifiant, sans la réadapter', async () => {
    vi.mocked(supabase.functions.invoke).mockImplementation(async (_, options) => ({ data: options?.method === 'GET' ? { capabilities: ['cookidoo_adaptation_v2'] } : (options?.body as { action?: string })?.action === 'send' ? { ok: true, export_id: 'j1' } : ready, error: null }) as never);
    const { result } = renderHook(() => useCookidooExport('r1'), { wrapper });
    await waitFor(() => expect(result.current.adaptation?.id).toBe('a1'));
    await act(async () => { await result.current.send.mutateAsync({}); });
    expect(supabase.functions.invoke).toHaveBeenCalledWith('export-recipe-cookidoo', { body: { recipe_id: 'r1', action: 'send', adaptation_id: 'a1', confirmation: adaptation.confirmation } });
    const bodies = vi.mocked(supabase.functions.invoke).mock.calls.map(([,o]) => o?.body as { action?: string });
    expect(bodies.some(b => b?.action === 'prepare')).toBe(false);
  });
  it('transmet les précisions à la copie et recharge les opérations après interruption', async () => {
    vi.mocked(supabase.functions.invoke).mockImplementation(async (_, options) => ({ data: options?.method === 'GET' ? { capabilities: ['cookidoo_adaptation_v2'] } : { ...ready, job: { id: 'j1', status: 'unknown' } }, error: null }) as never);
    const { result } = renderHook(() => useCookidooExport('r1'), { wrapper });
    await waitFor(() => expect(result.current.job?.status).toBe('unknown'));
    await act(async () => { await result.current.prepare.mutateAsync({ technical_water_ml: 500, clarifications: 'Eau uniquement pour la vapeur.' }); });
    expect(supabase.functions.invoke).toHaveBeenCalledWith('export-recipe-cookidoo', { body: { recipe_id: 'r1', action: 'prepare', technical_water_ml: 500, clarifications: 'Eau uniquement pour la vapeur.' } });
  });
});
