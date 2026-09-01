import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CookingChatSheet } from './CookingChatSheet';

const { mockChatInterface } = vi.hoisted(() => ({
  mockChatInterface: vi.fn(),
}));

vi.mock('@/components/chat/ChatInterface', () => ({
  ChatInterface: (props: Record<string, unknown>) => {
    mockChatInterface(props);
    return <div data-testid="chat-interface" />;
  },
}));

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  autoListen: false,
  recipeTitle: 'Ratatouille',
  recipeServings: 4,
  context: 'recipe' as const,
  messages: [],
  isStreaming: false,
  isSavingRecipe: false,
  sendMessage: vi.fn(),
  onCreateRecipe: vi.fn(),
  resetChat: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CookingChatSheet — assistant recette partagé', () => {
  it('reprend la coquille plein écran et contextualise son en-tête', () => {
    render(<CookingChatSheet {...defaultProps} />);

    expect(screen.getByRole('dialog')).toHaveClass('h-[var(--app-vh,100dvh)]', 'rounded-none');
    expect(screen.getByText('Chef')).toBeInTheDocument();
    expect(screen.getByText('Ratatouille · 4 portions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fermer l’assistant' })).toHaveClass('h-11', 'w-11');
  });

  it('transmet au chat les cartes inline et les suggestions de la fiche recette', () => {
    const onCreateRecipe = vi.fn();
    const onStartCooking = vi.fn();

    render(
      <CookingChatSheet
        {...defaultProps}
        onCreateRecipe={onCreateRecipe}
        onStartCooking={onStartCooking}
      />,
    );

    expect(mockChatInterface).toHaveBeenLastCalledWith(expect.objectContaining({
      onCreateRecipe,
      onStartCooking,
      suggestions: ['Adapter les quantités', 'Une alternative végétale ?', 'Comment améliorer cette recette ?'],
      placeholder: 'Poser une question',
    }));
  });

  it('affiche la progression et les suggestions propres au mode cuisine', () => {
    render(
      <CookingChatSheet
        {...defaultProps}
        context="cooking"
        completedStepsCount={2}
      />,
    );

    expect(screen.getByText('Ratatouille · 4 portions · 2 étapes terminées')).toBeInTheDocument();
    expect(mockChatInterface).toHaveBeenLastCalledWith(expect.objectContaining({
      suggestions: ['Par quoi remplacer ?', "C'est cuit ?", 'Une astuce ?'],
    }));
  });

  it('permet de recommencer une conversation depuis l’en-tête', () => {
    const resetChat = vi.fn();
    render(
      <CookingChatSheet
        {...defaultProps}
        messages={[
          { id: 'u1', role: 'user', content: 'Bonjour', timestamp: new Date() },
          { id: 'a1', role: 'assistant', content: 'Bonjour', timestamp: new Date() },
        ]}
        resetChat={resetChat}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle conversation' }));
    expect(resetChat).toHaveBeenCalledTimes(1);
  });
});
