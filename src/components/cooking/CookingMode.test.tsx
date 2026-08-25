import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recipe } from '@/types/recipe';
import { CookingMode } from './CookingMode';

const { mockUseRecipeChat, mockRequestWakeLock } = vi.hoisted(() => ({
  mockUseRecipeChat: vi.fn(),
  mockRequestWakeLock: vi.fn(),
}));

vi.mock('@/hooks/useCookingTimers', () => ({
  useCookingTimers: () => ({
    timers: [],
    addTimer: vi.fn(),
    toggleTimer: vi.fn(),
    dismissTimer: vi.fn(),
  }),
}));

vi.mock('@/hooks/useWakeLock', () => ({
  useWakeLock: () => ({ request: mockRequestWakeLock }),
}));

vi.mock('@/hooks/useRecipeChat', () => ({ useRecipeChat: mockUseRecipeChat }));
vi.mock('@/lib/playChime', () => ({ playChime: vi.fn() }));
vi.mock('./CookingChatSheet', () => ({ CookingChatSheet: () => null }));

const recipe: Recipe = {
  id: 'r1',
  user_id: 'u1',
  title: 'Pain maison',
  status: 'validated',
  is_favorite: false,
  servings: 4,
  ingredients: [
    { name: 'Farine', quantity: 200, unit: 'g' },
    { name: 'Eau', quantity: 120, unit: 'ml' },
  ],
  steps: [{
    order: 1,
    title: 'Former la pâte',
    text: 'Mélangez la farine et l’eau.',
    ingredient_names: ['Farine', 'Eau'],
  }],
  season: null,
  nutrition_tags: null,
  calorie_score: null,
  ai_summary: null,
  source_type: 'manual',
  source_image_url: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequestWakeLock.mockResolvedValue(undefined);
  mockUseRecipeChat.mockReturnValue({
    messages: [],
    isStreaming: false,
    pendingRecipe: null,
    isSavingRecipe: false,
    sendMessage: vi.fn(),
    savePendingRecipe: vi.fn(),
    cancelPendingRecipe: vi.fn(),
    regenerateResponse: vi.fn(),
    stopGeneration: vi.fn(),
  });
});

describe('CookingMode — quantités', () => {
  it('reprend les portions choisies, recalcule les quantités et ouvre la liste complète', () => {
    render(<CookingMode recipe={recipe} initialServings={6} onClose={vi.fn()} />);

    expect(screen.getByText('6 portions')).toBeInTheDocument();
    expect(screen.getByText('(300 g)')).toBeInTheDocument();
    expect(screen.getByText('(180 ml)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ajuster les quantités pour 6 portions' }));
    expect(screen.getByRole('dialog', { name: 'Tous les ingrédients' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Augmenter les portions' }));
    expect(screen.getAllByText('7 portions')).toHaveLength(2);
    expect(screen.getByText('(350 g)')).toBeInTheDocument();
    expect(screen.getByText('350 g')).toBeInTheDocument();
  });

  it('transmet à Chef la recette avec les quantités sélectionnées', () => {
    render(<CookingMode recipe={recipe} initialServings={6} onClose={vi.fn()} />);

    expect(mockUseRecipeChat).toHaveBeenCalledWith(expect.objectContaining({
      recipe: expect.objectContaining({
        servings: 6,
        ingredients: expect.arrayContaining([
          expect.objectContaining({ name: 'Farine', quantity: 300 }),
        ]),
      }),
    }));
  });

  it('préserve les recettes prévues pour plus de douze portions', () => {
    render(<CookingMode recipe={{ ...recipe, servings: 16 }} onClose={vi.fn()} />);

    expect(screen.getByText('16 portions')).toBeInTheDocument();
    expect(screen.getByText('(200 g)')).toBeInTheDocument();
  });

  it('utilise la base commune de deux portions pour une recette historique', () => {
    render(<CookingMode recipe={{ ...recipe, servings: null }} initialServings={2} onClose={vi.fn()} />);

    expect(screen.getByText('2 portions')).toBeInTheDocument();
    expect(screen.getByText('(200 g)')).toBeInTheDocument();
  });
});
