import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ShareRecipeDialog } from './ShareRecipeDialog';

describe('ShareRecipeDialog', () => {
  it('mode non contrôlé : affiche le bouton déclencheur, dialog fermé', () => {
    render(<ShareRecipeDialog recipeId="r1" />);
    // Le trigger est présent ; le contenu du dialog n'est pas monté tant que fermé.
    expect(screen.queryByText('Partager la recette')).not.toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('mode contrôlé ouvert : affiche le contenu du dialog', () => {
    render(<ShareRecipeDialog recipeId="r1" open showTrigger={false} onOpenChange={() => {}} />);
    expect(screen.getByText('Partager la recette')).toBeInTheDocument();
    expect(screen.getByLabelText('Adresse email du destinataire')).toBeInTheDocument();
  });
});
