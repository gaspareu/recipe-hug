import { useCallback, useEffect, useRef, useState } from 'react';

// Le type WakeLockSentinel n'est pas garanti dans toutes les lib DOM ; on en
// décrit le strict nécessaire pour éviter `any`.
interface WakeLockSentinelLike {
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
  removeEventListener: (type: 'release', listener: () => void) => void;
}

interface WakeLockNavigator {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
}

function getWakeLock() {
  return (navigator as Navigator & WakeLockNavigator).wakeLock;
}

/**
 * Empêche la mise en veille de l'écran via la Screen Wake Lock API (utile en
 * mode cuisine, où l'utilisateur ne touche pas l'écran pendant la cuisson).
 *
 * Réacquiert automatiquement le verrou quand l'onglet redevient visible : le
 * navigateur relâche le verrou dès que la page passe en arrière-plan.
 */
export function useWakeLock() {
  const [isActive, setIsActive] = useState(false);
  const isSupported = typeof navigator !== 'undefined' && !!getWakeLock();

  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);
  // Mémorise l'intention de l'utilisateur (verrou souhaité) indépendamment de
  // l'état réel du sentinel, qui peut être relâché par le système.
  const wantActiveRef = useRef(false);

  const acquire = useCallback(async () => {
    const wakeLock = getWakeLock();
    if (!wakeLock) return;
    try {
      const sentinel = await wakeLock.request('screen');
      sentinelRef.current = sentinel;
      setIsActive(true);
      sentinel.addEventListener('release', () => {
        sentinelRef.current = null;
        setIsActive(false);
      });
    } catch {
      // Refus du navigateur (onglet caché, batterie faible…) : on reste inactif
      // sans interrompre l'expérience.
      setIsActive(false);
    }
  }, []);

  const request = useCallback(async () => {
    wantActiveRef.current = true;
    await acquire();
  }, [acquire]);

  const release = useCallback(async () => {
    wantActiveRef.current = false;
    const sentinel = sentinelRef.current;
    sentinelRef.current = null;
    setIsActive(false);
    if (sentinel) {
      try { await sentinel.release(); } catch { /* déjà relâché */ }
    }
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && wantActiveRef.current && !sentinelRef.current) {
        void acquire();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      // Libère le verrou au démontage pour ne pas le laisser actif hors mode cuisine.
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      wantActiveRef.current = false;
      if (sentinel) void sentinel.release().catch(() => undefined);
    };
  }, [acquire]);

  return { isSupported, isActive, request, release };
}
