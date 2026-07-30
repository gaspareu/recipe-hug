import { useEffect } from 'react';

/** Variable CSS portant la hauteur visible ; repli `100dvh` si jamais renseignée. */
export const APP_VIEWPORT_HEIGHT_VAR = '--app-vh';

/**
 * Publie dans `--app-vh` la hauteur réellement visible, clavier virtuel déduit.
 *
 * `100dvh` ne se recalcule pas à l'ouverture du clavier sur iOS : la page garde
 * sa hauteur plein écran et la zone de saisie passe sous le clavier.
 * `visualViewport` est la seule source fiable de la hauteur restante.
 *
 * Passer par une variable CSS plutôt que par un state React est délibéré : iOS
 * émet ces événements en rafale pendant l'animation du clavier, et un state
 * re-rendrait tout l'arbre du chat (dont le markdown, non mémoïsé) à chaque
 * frame. La variable étant posée sur `documentElement`, elle atteint aussi les
 * contenus rendus dans un portail.
 *
 * Sans `visualViewport` (SSR, jsdom, navigateurs anciens) la variable reste
 * absente et les consommateurs retombent sur `100dvh`.
 */
export function useViewportHeight(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const root = document.documentElement;
    // Seul `resize` porte un changement de hauteur ; `scroll` ne déplace que
    // l'origine du viewport visuel et reposerait la même valeur.
    const update = () => root.style.setProperty(APP_VIEWPORT_HEIGHT_VAR, `${viewport.height}px`);
    update();

    viewport.addEventListener('resize', update);
    return () => {
      viewport.removeEventListener('resize', update);
      root.style.removeProperty(APP_VIEWPORT_HEIGHT_VAR);
    };
  }, []);
}
