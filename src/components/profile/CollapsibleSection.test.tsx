import { render, screen } from '@testing-library/react';
import { CollapsibleSection } from './CollapsibleSection';

describe('CollapsibleSection', () => {
  it('annonce la description en plus du titre de la commande', () => {
    render(
      <CollapsibleSection title="Configuration IA" description="Utilisez vos propres clés API">
        <p>Contenu</p>
      </CollapsibleSection>,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Configuration IA' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Configuration IA' })).toHaveAccessibleDescription('Utilisez vos propres clés API');
  });
});
