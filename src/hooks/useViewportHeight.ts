import { useEffect, useState } from 'react';

/**
 * Hauteur réellement visible, clavier virtuel déduit.
 *
 * `100dvh` ne se recalcule pas à l'ouverture du clavier sur iOS : la page garde
 * sa hauteur plein écran et la zone de saisie passe sous le clavier. `visualViewport`
 * est la seule source fiable de la hauteur restante.
 *
 * Retourne `undefined` tant que l'API n'est pas disponible (SSR, jsdom, navigateurs
 * anciens) — l'appelant retombe alors sur `100dvh`.
 */
export function useViewportHeight(): number | undefined {
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => setHeight(viewport.height);
    update();

    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);

  return height;
}
