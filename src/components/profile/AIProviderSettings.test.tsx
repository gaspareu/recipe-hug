import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, beforeEach, describe, it, expect } from 'vitest';
import type { AISettings, MaskedKeyInfo, AIProvider } from '@/hooks/useAISettings';

// État contrôlé injecté dans le hook mocké.
interface MockState {
  settings: AISettings | null;
  maskedKeys: Record<string, MaskedKeyInfo>;
  hasApiKeyForProvider: (p: AIProvider) => boolean;
  updateMutateAsync: ReturnType<typeof vi.fn>;
  validateMutateAsync: ReturnType<typeof vi.fn>;
}

const mockState: MockState = {
  settings: null,
  maskedKeys: {},
  hasApiKeyForProvider: () => false,
  updateMutateAsync: vi.fn().mockResolvedValue(undefined),
  validateMutateAsync: vi.fn().mockResolvedValue({ valid: true }),
};

vi.mock('@/hooks/useAISettings', async (importActual) => {
  const actual = await importActual<typeof import('@/hooks/useAISettings')>();
  return {
    ...actual,
    useAISettings: () => ({
      settings: mockState.settings,
      isLoading: false,
      error: null,
      updateSettings: { mutateAsync: mockState.updateMutateAsync, isPending: false },
      validateApiKey: { mutateAsync: mockState.validateMutateAsync },
      maskedKeys: mockState.maskedKeys,
      hasApiKeyForProvider: mockState.hasApiKeyForProvider,
      getMaskedKeyForProvider: (p: Exclude<AIProvider, 'anthropic'>) => mockState.maskedKeys?.[p]?.masked ?? null,
      effectiveProvider: mockState.settings?.provider ?? 'anthropic',
      effectiveModel: mockState.settings?.preferred_model ?? 'claude-sonnet-4-6',
    }),
  };
});

vi.mock('@/components/ui/sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { AIProviderSettings } from './AIProviderSettings';
import { toast } from '@/components/ui/sonner';

function makeSettings(overrides: Partial<AISettings> = {}): AISettings {
  return {
    id: 's1',
    user_id: 'u1',
    provider: 'anthropic',
    api_key: null,
    preferred_model: null,
    agent_configs: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockState.settings = null;
  mockState.maskedKeys = {};
  mockState.hasApiKeyForProvider = () => false;
  mockState.updateMutateAsync = vi.fn().mockResolvedValue(undefined);
  mockState.validateMutateAsync = vi.fn().mockResolvedValue({ valid: true });
});

describe('AIProviderSettings', () => {
  it("n'affiche pas l'avertissement 'ajoutez une clé' quand le fournisseur a déjà une clé (maskedKeys)", async () => {
    // Regression #6 : la présence de clé était lue depuis settings.provider_api_keys
    // (toujours vide) au lieu de maskedKeys/hasApiKeyForProvider -> avertissement
    // erroné et bouton Enregistrer bloqué pour un utilisateur BYOK au rechargement.
    mockState.settings = makeSettings({ provider: 'gemini', preferred_model: 'gemini-2.5-flash' });
    mockState.maskedKeys = { gemini: { has_key: true, masked: 'AIza••••1234' } };
    mockState.hasApiKeyForProvider = (p) => p === 'anthropic' || p === 'gemini';

    render(<AIProviderSettings />);

    // Attend que l'effet applique le provider gemini (libellé du modèle par défaut).
    await screen.findByText(/Modèle préféré par défaut \(Google Gemini\)/);

    expect(screen.queryByText(/Ajoutez une clé API pour Google Gemini/)).not.toBeInTheDocument();
  });

  it("affiche un toast d'erreur quand l'enregistrement échoue (pas d'échec silencieux)", async () => {
    // Regression #7 : handleSave n'avait pas de catch -> une sauvegarde échouée
    // (réseau, RLS) était invisible, l'utilisateur croyait avoir enregistré.
    mockState.settings = makeSettings({ provider: 'gemini', preferred_model: null });
    mockState.maskedKeys = { gemini: { has_key: true, masked: 'AIza••••1234' } };
    mockState.hasApiKeyForProvider = (p) => p === 'anthropic' || p === 'gemini';
    mockState.updateMutateAsync = vi.fn().mockRejectedValue(new Error('save fail'));

    render(<AIProviderSettings />);

    const saveBtn = await screen.findByRole('button', { name: /Enregistrer la configuration/ });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    fireEvent.click(saveBtn);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
