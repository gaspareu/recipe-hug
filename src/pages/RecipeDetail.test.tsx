import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recipe } from '@/types/recipe';
import type { PendingRecipe } from '@/hooks/useChatEngine';

const { hookState, mockUseRecipeChat, mockUpdateRecipe, mockCreateRecipe } = vi.hoisted(() => ({
  hookState: { recipe: null as Recipe | null },
  mockUseRecipeChat: vi.fn(),
  mockUpdateRecipe: vi.fn().mockResolvedValue(undefined),
  mockCreateRecipe: vi.fn(),
}));

vi.mock('framer-motion', () => ({
  motion: { div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div> },
  useReducedMotion: () => false,
}));
vi.mock('@/components/layout/MainLayout', () => ({ MainLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/recipes/RecipeImageDisplay', () => ({ RecipeImageDisplay: () => <div data-testid="recipe-image" /> }));
vi.mock('@/components/recipes/RecipeDetailHeader', () => ({ RecipeDetailHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('@/components/recipes/RecipeActionsMenu', () => ({ RecipeActionsMenu: () => <button type="button">Actions</button> }));
vi.mock('@/components/recipes/RecipeStepsList', () => ({ RecipeStepsList: () => <div>Étapes de la recette</div> }));
vi.mock('@/components/recipes/RecipeVersionHistory', () => ({ RecipeVersionHistory: () => null }));
vi.mock('@/components/recipes/FavoriteToggle', () => ({ FavoriteToggle: () => <button type="button">Favori</button> }));
vi.mock('@/components/recipes/IngredientChecklist', () => ({
  IngredientChecklistWithHeader: ({ renderHeader }: { renderHeader: (toggle: React.ReactNode) => React.ReactNode }) => <div>{renderHeader(null)}</div>,
}));
vi.mock('@/components/cooking/CookingModeContainer', () => ({
  CookingModeContainer: ({ recipeId, initialServings, chatSession }: { recipeId: string; initialServings?: number; chatSession?: unknown }) => (
    <div>Mode cuisine {recipeId} · {initialServings ?? '-'} portions · session partagée : {chatSession ? 'oui' : 'non'}</div>
  ),
}));
vi.mock('@/components/cooking/CookingChatSheet', () => ({
  CookingChatSheet: ({
    open,
    recipeTitle,
    context,
    onStartCooking,
  }: {
    open: boolean;
    recipeTitle: string;
    context: string;
    onStartCooking?: (recipeId: string, servings: number) => void;
  }) => open ? (
    <div role="dialog">
      Assistant {recipeTitle} · {context}
      <button type="button" onClick={() => onStartCooking?.('r1', 6)}>Démarrer depuis Chef</button>
      <button type="button" onClick={() => onStartCooking?.('r2', 2)}>Démarrer une autre recette</button>
    </div>
  ) : null,
}));
vi.mock('@/hooks/useRecipeChat', () => ({ useRecipeChat: mockUseRecipeChat }));
vi.mock('@/hooks/useRecipes', () => ({
  useRecipe: () => ({ data: hookState.recipe, isLoading: false }),
  useToggleFavorite: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateRecipe: () => ({ mutateAsync: mockUpdateRecipe }),
  useCreateRecipe: () => ({ mutateAsync: mockCreateRecipe }),
}));
vi.mock('@/hooks/useGenerateRecipeImage', () => ({ useGenerateRecipeImage: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock('@/hooks/useAsyncAction', () => ({ useAsyncAction: () => ({ run: vi.fn(), showLoader: false }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { storage: { from: vi.fn() }, functions: { invoke: vi.fn() } } }));

import RecipeDetail from './RecipeDetail';

const recipe: Recipe = {
  id: 'r1',
  user_id: 'u1',
  title: 'Poivrons farcis',
  status: 'validated',
  is_favorite: false,
  servings: 4,
  ingredients: [{ name: 'Poivron', quantity: 4, unit: '' }],
  steps: [{ order: 1, text: 'Farcir les poivrons' }],
  season: null,
  nutrition_tags: null,
  calorie_score: null,
  ai_summary: null,
  source_type: 'manual',
  source_image_url: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/recipes/r1']}>
      <Routes>
        <Route path="/recipes/:id" element={<RecipeDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  hookState.recipe = recipe;
  mockUseRecipeChat.mockReturnValue({
    messages: [{ id: 'welcome', role: 'assistant', content: 'Bonjour', timestamp: new Date() }],
    isStreaming: false,
    toolActivity: null,
    isSavingRecipe: false,
    sendMessage: vi.fn(),
    createProposedRecipe: vi.fn(),
    resetChat: vi.fn(),
    regenerateResponse: vi.fn(),
    stopGeneration: vi.fn(),
    syncContext: vi.fn(),
  });
});

describe('RecipeDetail — assistant contextualisé', () => {
  it('propose Chef directement à côté du mode cuisine', () => {
    renderPage();

    expect(screen.getByRole('button', { name: 'Demander à Chef' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cuisiner' })).toBeInTheDocument();
  });

  it('ouvre le chat partagé avec le contexte de la recette', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Demander à Chef' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Assistant Poivrons farcis · recipe');
    expect(mockUseRecipeChat).toHaveBeenCalledWith(expect.objectContaining({
      recipe: expect.objectContaining({ id: 'r1', title: 'Poivrons farcis' }),
      completedSteps: expect.any(Set),
    }));
  });

  it('met à jour la recette active indiquée par le chat', async () => {
    renderPage();
    const options = mockUseRecipeChat.mock.calls[0][0] as {
      onRecipeUpdate: (data: PendingRecipe) => Promise<void>;
    };

    await options.onRecipeUpdate({
      title: 'Soupe modifiée',
      servings: 2,
      ingredients: [],
      steps: [],
      isUpdate: true,
      originalRecipeId: 'r2',
    });

    expect(mockUpdateRecipe).toHaveBeenCalledWith(expect.objectContaining({
      id: 'r2',
      title: 'Soupe modifiée',
    }));
  });

  it('reste accessible même si la recette ne contient aucune étape', () => {
    hookState.recipe = { ...recipe, steps: [] };
    renderPage();

    expect(screen.getByRole('button', { name: 'Demander à Chef' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cuisiner' })).not.toBeInTheDocument();
  });

  it('réutilise la session de la fiche en entrant dans le mode cuisine', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Cuisiner' }));

    expect(screen.getByText('Mode cuisine r1 · 4 portions · session partagée : oui')).toBeInTheDocument();
  });

  it('reprend les portions choisies dans une carte du chat', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Demander à Chef' }));
    fireEvent.click(screen.getByRole('button', { name: 'Démarrer depuis Chef' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Mode cuisine r1 · 6 portions · session partagée : oui')).toBeInTheDocument();
  });

  it("n'injecte pas le contexte de la recette courante dans une autre recette", () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Demander à Chef' }));
    fireEvent.click(screen.getByRole('button', { name: 'Démarrer une autre recette' }));

    expect(screen.getByText('Mode cuisine r2 · 2 portions · session partagée : non')).toBeInTheDocument();
  });
});
