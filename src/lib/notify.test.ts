import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from '@/components/ui/sonner';
import { notifySaveSuccess, notifySaveError } from './notify';

vi.mock('@/components/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('notify — feedback de sauvegarde', () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it('notifySaveSuccess affiche un toast de succès (variante verte)', () => {
    notifySaveSuccess('Préférences enregistrées');
    expect(toast.success).toHaveBeenCalledWith('Préférences enregistrées');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('notifySaveError affiche un toast d\'erreur avec une description par défaut', () => {
    notifySaveError("Échec de l'enregistrement des préférences");
    expect(toast.error).toHaveBeenCalledWith(
      "Échec de l'enregistrement des préférences",
      { description: 'Vérifie ta connexion et réessaie.' },
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('notifySaveError accepte une description personnalisée', () => {
    notifySaveError('Échec', 'Détail spécifique');
    expect(toast.error).toHaveBeenCalledWith('Échec', {
      description: 'Détail spécifique',
    });
  });
});
