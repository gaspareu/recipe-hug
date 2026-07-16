import { toast } from '@/components/ui/sonner';

/** Description par défaut d'un échec de sauvegarde (action corrective côté utilisateur). */
const DEFAULT_ERROR_DESCRIPTION = 'Vérifie ta connexion et réessaie.';

/**
 * Toast de succès pour une sauvegarde (variante verte cohérente dans toute l'app).
 */
export function notifySaveSuccess(message: string): void {
  toast.success(message);
}

/**
 * Toast d'erreur pour un échec de sauvegarde (variante rouge + description).
 * Le log technique détaillé reste à la charge de l'appelant (source unique).
 */
export function notifySaveError(
  message: string,
  description: string = DEFAULT_ERROR_DESCRIPTION,
): void {
  toast.error(message, { description });
}
