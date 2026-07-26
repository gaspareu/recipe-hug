import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CookingChatSheet } from './CookingChatSheet';
import type { PendingRecipe } from '@/hooks/useChatEngine';

// Mock framer-motion pour éviter les erreurs d'animation en jsdom
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

// Mock ChatInterface — non pertinent pour ces tests
vi.mock('@/components/chat/ChatInterface', () => ({
  ChatInterface: () => <div data-testid="chat-interface" />,
}));

const basePendingRecipe: PendingRecipe = {
  title: 'Ratatouille',
  servings: 4,
  ingredients: [],
  steps: [],
  isUpdate: true,
};

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  autoListen: false,
  messages: [],
  isStreaming: false,
  pendingRecipe: null,
  isSavingRecipe: false,
  sendMessage: vi.fn(),
  savePendingRecipe: vi.fn(),
  cancelPendingRecipe: vi.fn(),
};

describe('CookingChatSheet — barre de confirmation', () => {
  it("n'affiche pas la barre si pendingRecipe est null", () => {
    render(<CookingChatSheet {...defaultProps} pendingRecipe={null} />);
    expect(screen.queryByText(/Mettre à jour/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Enregistrer/)).not.toBeInTheDocument();
  });

  it('affiche la barre avec le bouton « Mettre à jour » quand isUpdate est true', () => {
    render(<CookingChatSheet {...defaultProps} pendingRecipe={basePendingRecipe} />);
    expect(screen.getByText('Mettre à jour "Ratatouille" ?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mettre à jour/ })).toBeInTheDocument();
  });

  it('affiche le bouton « Créer » quand isUpdate est false', () => {
    const pendingCreate: PendingRecipe = { ...basePendingRecipe, isUpdate: false };
    render(<CookingChatSheet {...defaultProps} pendingRecipe={pendingCreate} />);
    expect(screen.getByText('Enregistrer "Ratatouille" ?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Créer/ })).toBeInTheDocument();
  });

  it('appelle savePendingRecipe au clic sur le bouton de confirmation', () => {
    const savePendingRecipe = vi.fn();
    render(<CookingChatSheet {...defaultProps} pendingRecipe={basePendingRecipe} savePendingRecipe={savePendingRecipe} />);
    fireEvent.click(screen.getByRole('button', { name: /Mettre à jour/ }));
    expect(savePendingRecipe).toHaveBeenCalledTimes(1);
  });

  it("appelle cancelPendingRecipe au clic sur le bouton d'annulation", () => {
    const cancelPendingRecipe = vi.fn();
    render(<CookingChatSheet {...defaultProps} pendingRecipe={basePendingRecipe} cancelPendingRecipe={cancelPendingRecipe} />);
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(cancelPendingRecipe).toHaveBeenCalledTimes(1);
  });
});
