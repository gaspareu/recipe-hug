import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
vi.mock('@/hooks/useCookidooConnector', () => ({ useCookidooConnector: () => ({ status: { data: { configured: true }, isLoading: false } }) }));
const prepare = vi.fn(), send = vi.fn(), check = vi.fn(), refresh = vi.fn();
const state = { adaptation: null, job: null, hasDestination: false, unavailable: false, isLoading: false, error: null, prepare: { mutateAsync: prepare }, send: { mutateAsync: send }, check: { mutateAsync: check }, acknowledgeAbsent: { mutateAsync: vi.fn() }, refresh } as Record<string, unknown>;
vi.mock('@/hooks/useCookidooExport', () => ({ useCookidooExport: () => state, CookidooError: class extends Error {} }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
import { toast } from 'sonner';
import { ExportToCookidooButton } from './ExportToCookidooButton';
const ready = { id: 'a1', status: 'ready', recipe: { title: 'Pain', steps: [{ order: 1, text: 'Pétrir 2 minutes.' }] }, ingredients: ['300 g de farine'], changes: ['Pétrissage dans le bol.'], notes: [], blockers: [], guided_steps: 1, reused: true };
const renderButton = () => render(<MemoryRouter><ExportToCookidooButton recipeId="r1" open showTrigger={false} /></MemoryRouter>);
describe('parcours Cookidoo', () => {
  beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); Object.assign(state, { adaptation: null, job: null, hasDestination: false }); });
  it('prépare une copie sans envoyer la recette ni annoncer un succès', async () => {
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'Préparer la version Cookidoo' }));
    await waitFor(() => expect(prepare).toHaveBeenCalledWith({}));
    expect(send).not.toHaveBeenCalled(); expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByText(/Votre recette dans le Livre reste inchangée/)).toBeInTheDocument();
  });
  it('réutilise une version prête et présente les changements avant confirmation', async () => {
    Object.assign(state, { adaptation: ready, hasDestination: true });
    renderButton();
    expect(screen.getByText(/Aucune nouvelle adaptation/)).toBeInTheDocument();
    expect(screen.getByText('Pétrissage dans le bol.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour sur Cookidoo' }));
    await waitFor(() => expect(send).toHaveBeenCalled()); expect(prepare).not.toHaveBeenCalled();
  });
  it('bloque l’envoi lorsque des précisions manquent et les applique uniquement à la copie', async () => {
    Object.assign(state, { adaptation: { ...ready, status: 'needs_input', blockers: ['Préciser l’eau pour la vapeur.'] } });
    renderButton();
    expect(screen.queryByRole('button', { name: 'Envoyer cette version' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Eau dans le bol/), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compléter la version' }));
    await waitFor(() => expect(prepare).toHaveBeenCalledWith({ technical_water_ml: 500, clarifications: '' }));
  });
  it('un résultat inconnu ne propose pas de renvoi aveugle', () => {
    Object.assign(state, { adaptation: ready, job: { id: 'j1', status: 'unknown' } });
    renderButton();
    expect(screen.getByRole('button', { name: 'Vérifier l’envoi' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Envoyer cette version' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmer l’absence d’envoi' })).toBeDisabled();
    expect(toast.warning).toHaveBeenCalledTimes(1); expect(toast.success).not.toHaveBeenCalled();
  });
  it('ne notifie qu’une fois un succès déjà retrouvé après navigation', () => {
    Object.assign(state, { job: { id: 'j1', status: 'success', warnings: [], updated: false } });
    const view = renderButton();view.unmount();renderButton();
    expect(toast.success).toHaveBeenCalledExactlyOnceWith('Recette disponible sur Cookidoo', expect.any(Object));
  });
});


it('un accord de remplacement ne s’applique pas à une tentative ultérieure', async () => {
  vi.clearAllMocks();sessionStorage.clear();
  Object.assign(state, { adaptation: ready, job: { id: 'conflict-1', status: 'failed', error_code: 'remote_changed' }, hasDestination: true });
  const view = renderButton();
  fireEvent.click(screen.getByLabelText(/Remplacer les modifications/));
  fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour sur Cookidoo' }));
  await waitFor(() => expect(send).toHaveBeenCalledWith({ replace_remote: true, recreate_remote: false }));
  Object.assign(state, { job: { id: 'conflict-2', status: 'failed', error_code: 'remote_changed' } });
  view.rerender(<MemoryRouter><ExportToCookidooButton recipeId="r1" open showTrigger={false} /></MemoryRouter>);
  expect(screen.getByLabelText(/Remplacer les modifications/)).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'Mettre à jour sur Cookidoo' })).toBeDisabled();
});
