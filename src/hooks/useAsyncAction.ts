import { useCallback, useRef, useState, useEffect } from 'react';
import { toast } from '@/components/ui/sonner';

interface UseAsyncActionOptions {
  /** Message toast affiché en cas de succès (optionnel). */
  successMessage?: string;
  /** Message toast en cas d'erreur. Par défaut : le message de l'erreur. */
  errorMessage?: string;
  /**
   * Délai (ms) avant d'afficher le loader. En dessous, l'action est considérée
   * comme instantanée : pas de spinner (évite le flicker). Défaut : 300ms.
   */
  loaderDelayMs?: number;
}

interface UseAsyncActionResult<TArgs extends unknown[]> {
  /** Exécute l'action en gérant pending, loader différé et toast d'erreur. */
  run: (...args: TArgs) => Promise<void>;
  /** Vrai dès le début de l'action (pour désactiver le bouton immédiatement). */
  isPending: boolean;
  /** Vrai seulement si l'action dépasse `loaderDelayMs` (pour afficher le spinner). */
  showLoader: boolean;
}

/**
 * Encapsule une action asynchrone avec un feedback cohérent :
 * - `isPending` immédiat (désactive le déclencheur, évite le double-clic),
 * - `showLoader` différé de 300ms (pas de spinner sur les actions instantanées),
 * - toast d'erreur automatique (plus d'échec silencieux),
 * - toast de succès optionnel.
 */
export function useAsyncAction<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<unknown>,
  options: UseAsyncActionOptions = {},
): UseAsyncActionResult<TArgs> {
  const { successMessage, errorMessage, loaderDelayMs = 300 } = options;
  const [isPending, setIsPending] = useState(false);
  const [showLoader, setShowLoader] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const run = useCallback(
    async (...args: TArgs) => {
      setIsPending(true);
      timerRef.current = setTimeout(() => {
        if (mountedRef.current) setShowLoader(true);
      }, loaderDelayMs);
      try {
        await fn(...args);
        if (successMessage) toast(successMessage);
      } catch (error) {
        const message =
          errorMessage ?? (error instanceof Error ? error.message : 'Une erreur est survenue');
        toast(message);
        console.error('Action échouée:', error);
      } finally {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (mountedRef.current) {
          setIsPending(false);
          setShowLoader(false);
        }
      }
    },
    [fn, successMessage, errorMessage, loaderDelayMs],
  );

  return { run, isPending, showLoader };
}
