import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
  afterEach(() => vi.useRealTimers());
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

it('un échec technique explique le blocage et permet de relancer sans eau ni commentaire', async () => {
  vi.clearAllMocks(); sessionStorage.clear();
  Object.assign(state, { adaptation: { ...ready, recipe: null, status: 'failed', error_code: 'adaptation_failed', blockers: ['Un ingrédient partagé n’a pas de répartition complète. Ingrédient : sel.'] }, job: null, hasDestination: false });
  renderButton();
  expect(screen.getByRole('alert')).toHaveTextContent('Ingrédient : sel');
  expect(screen.queryByLabelText(/Eau dans le bol/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Précisions pour/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Envoyer cette version' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer l’adaptation' }));
  await waitFor(() => expect(prepare).toHaveBeenCalledWith({}));
  expect(send).not.toHaveBeenCalled();
});

it('affiche une attente active sans pourcentage inventé et conserve le bouton désactivé', () => {
  Object.assign(state, { adaptation: { status: 'preparing', started_at: new Date().toISOString() }, job: null });
  renderButton();
  expect(screen.getByText(/Temps écoulé/)).toBeInTheDocument();
  expect(screen.getByText(/Vous pouvez fermer cette fenêtre/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Adaptation pour votre TM7…' })).toBeDisabled();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});

it('compte le délai réel puis permet une nouvelle adaptation sans la lancer automatiquement', async () => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-25T10:00:00Z'));
  Object.assign(state, { adaptation: { status: 'failed', error_code: 'preparation_rate_limited', retry_at: '2026-10-25T10:00:02Z' }, job: null });
  renderButton();
  expect(screen.getByText(/Nouvelle tentative dans 2 s/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Adaptation bientôt disponible' })).toBeDisabled();
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(screen.getByText(/Vous pouvez réessayer l’adaptation maintenant/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Réessayer l’adaptation' })).toBeEnabled();
  expect(prepare).not.toHaveBeenCalled();
  vi.useRealTimers();
});

it('un ancien envoi réussi ne valide pas la nouvelle adaptation', () => {
  Object.assign(state, { adaptation: { id: 'new', status: 'preparing' }, job: { id: 'old-job', status: 'success', adaptation_id: 'old', warnings: [] } });
  renderButton();
  expect(screen.getByText('Adapter').closest('li')).toHaveAttribute('aria-current', 'step');
  expect(screen.getByText('Envoyer').closest('li')).not.toHaveAttribute('aria-current');
});
