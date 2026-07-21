import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';

/**
 * Garde-fou : l'application doit monter un conteneur de toasts.
 *
 * Régression constatée le 19/07/2026 — `<Toaster />` n'était monté nulle part.
 * Tous les appels `toast.*` étaient donc silencieux : l'export Cookidoo
 * réussissait (200, recette créée) sans que l'utilisateur voie la moindre
 * confirmation, ce qui donnait l'impression d'une fonctionnalité cassée.
 * Trois écrans étaient concernés : export Cookidoo, partage, liste de courses.
 */

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

describe('App — retour visuel global', () => {
  beforeEach(() => {
    // jsdom n'implémente pas matchMedia, dont dépend la résolution du thème.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    window.history.pushState({}, '', '/auth');
  });

  // NB : sonner ne rend l'élément `[data-sonner-toaster]` qu'au premier toast ;
  // au montage, seule la région ARIA « Notifications » existe. C'est donc elle
  // qui atteste du montage, et l'affichage réel d'un toast qui fait foi.

  // Timeout élargi : ce test importe `App` à froid, donc tout l'arbre de routes
  // lazy. Isolé il tient en ~0,5 s, mais en suite complète (55 fichiers en
  // parallèle) il a déjà dépassé les 5 s par défaut.
  it('monte la région de notifications, sans quoi tout retour utilisateur est perdu', async () => {
    const { default: App } = await import('./App');
    render(<App />);

    await waitFor(() => {
      expect(document.querySelector('section[aria-label*="Notifications"]')).not.toBeNull();
    });
  }, 20000);

  it('affiche effectivement un toast déclenché depuis un composant', async () => {
    const { default: App } = await import('./App');
    render(<App />);

    await waitFor(() => {
      expect(document.querySelector('section[aria-label*="Notifications"]')).not.toBeNull();
    });

    toast.success('Recette envoyée vers Cookidoo');

    expect(await screen.findByText('Recette envoyée vers Cookidoo')).toBeInTheDocument();
  });
});
