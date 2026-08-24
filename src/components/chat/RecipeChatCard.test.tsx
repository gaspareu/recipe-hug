import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecipeChatCard } from './RecipeChatCard';
import type { RecipeCard } from '@/hooks/useChatEngine';

const proposed: RecipeCard = {
  status: 'proposed', title: 'Buddha bowl', servings: 2, stepsCount: 3, isUpdate: false,
  ingredients: [{ name: 'Avocat', quantity: 2, unit: '' }],
  intro: ['Avocat mûr.'], introClosing: 'Assembler.', tip: 'Feu vif.',
};
const saved: RecipeCard = { ...proposed, status: 'saved', id: 'r1' };

describe('RecipeChatCard', () => {
  it("n'affiche pas l'introduction contextuelle de la recette", () => {
    render(<RecipeChatCard card={proposed} onCreate={vi.fn()} onStartCooking={vi.fn()} onOpenDetail={vi.fn()} />);
    expect(screen.queryByText('Avocat mûr.')).not.toBeInTheDocument();
    expect(screen.queryByText('Assembler.')).not.toBeInTheDocument();
    expect(screen.getByText('Astuce :')).toBeInTheDocument();
  });

  it('état proposed : affiche un seul bouton « Créer la recette »', () => {
    render(<RecipeChatCard card={proposed} onCreate={vi.fn()} onStartCooking={vi.fn()} onOpenDetail={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Créer la recette/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Commencer à cuisiner/i })).toBeNull();
  });

  it('état saved : affiche « Commencer à cuisiner » + accès détail', () => {
    render(<RecipeChatCard card={saved} onCreate={vi.fn()} onStartCooking={vi.fn()} onOpenDetail={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Commencer à cuisiner/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Créer la recette/i })).toBeNull();
  });

  it('incrémenter les portions recalcule les quantités affichées', () => {
    render(<RecipeChatCard card={proposed} onCreate={vi.fn()} onStartCooking={vi.fn()} onOpenDetail={vi.fn()} />);
    const plus = screen.getByRole('button', { name: /augmenter les portions/i });
    fireEvent.click(plus); // 2 → 3 portions
    fireEvent.click(plus); // 3 → 4 portions
    // Avocat 2 → 4 (portions doublées) — affichage « 4 Avocat » (unité vide omise)
    expect(screen.getByText(/4\s*Avocat/)).toBeInTheDocument();
  });

  it('état proposed + isUpdate : le bouton devient « Mettre à jour la recette »', () => {
    render(<RecipeChatCard card={{ ...proposed, isUpdate: true }} onCreate={vi.fn()} onStartCooking={vi.fn()} onOpenDetail={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Mettre à jour la recette/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Créer la recette/i })).toBeNull();
  });

  it('« Créer la recette » remonte les portions choisies', () => {
    const onCreate = vi.fn();
    render(<RecipeChatCard card={proposed} onCreate={onCreate} onStartCooking={vi.fn()} onOpenDetail={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /augmenter les portions/i }));
    fireEvent.click(screen.getByRole('button', { name: /Créer la recette/i }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ servings: 3 }));
  });

  it('borne basse : le bouton moins est désactivé à 1 portion', () => {
    render(<RecipeChatCard card={{ ...proposed, servings: 1 }} onCreate={vi.fn()} onStartCooking={vi.fn()} onOpenDetail={vi.fn()} />);
    expect(screen.getByRole('button', { name: /diminuer les portions/i })).toBeDisabled();
  });

  it('borne haute : le bouton plus est désactivé à 12 portions', () => {
    render(<RecipeChatCard card={{ ...proposed, servings: 12 }} onCreate={vi.fn()} onStartCooking={vi.fn()} onOpenDetail={vi.fn()} />);
    expect(screen.getByRole('button', { name: /augmenter les portions/i })).toBeDisabled();
  });

  it('isSaving=true désactive le bouton Créer la recette', () => {
    render(<RecipeChatCard card={proposed} isSaving onCreate={vi.fn()} onStartCooking={vi.fn()} onOpenDetail={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Créer la recette/i })).toBeDisabled();
  });
});
