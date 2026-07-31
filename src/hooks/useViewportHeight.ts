import { useEffect } from 'react';

/** Variable CSS portant la hauteur visible ; repli `100dvh` si jamais renseignée. */
export const APP_VIEWPORT_HEIGHT_VAR = '--app-vh';

/**
 * Variable CSS portant le décalage du viewport visuel sous le viewport de mise
 * en page ; repli `0px`. À appliquer en `top` sur une coquille `position: fixed`.
 */
export const APP_VIEWPORT_TOP_VAR = '--app-vh-top';

/** Relecture après l'animation du clavier iOS (~250 ms), marge comprise. */
const SETTLE_DELAY_MS = 400;

/**
 * Publie la géométrie du viewport visuel : hauteur réellement visible
 * (`--app-vh`, clavier virtuel déduit) et décalage vertical (`--app-vh-top`).
 *
 * `100dvh` ne se recalcule pas à l'ouverture du clavier sur iOS : la page garde
 * sa hauteur plein écran et la zone de saisie passe sous le clavier.
 * `visualViewport` est la seule source fiable.
 *
 * Le décalage est tout aussi nécessaire que la hauteur : pour dégager le champ
 * focalisé, iOS fait défiler le viewport visuel *à l'intérieur* du viewport de
 * mise en page. Or `position: fixed` s'ancre au viewport de mise en page — sans
 * compensation, la coquille de l'app sort par le haut de l'écran et n'y revient
 * jamais, la page n'ayant rien à faire défiler pour la ramener.
 *
 * Passer par des variables CSS plutôt que par un state React est délibéré : iOS
 * émet ces événements en rafale pendant l'animation du clavier, et un state
 * re-rendrait tout l'arbre du chat (dont le markdown, non mémoïsé) à chaque
 * frame. Les variables étant posées sur `documentElement`, elles atteignent
 * aussi les contenus rendus dans un portail.
 *
 * Sans `visualViewport` (SSR, jsdom, navigateurs anciens) les variables restent
 * absentes et les consommateurs retombent sur leurs replis.
 */
export function useViewportHeight(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const root = document.documentElement;
    let frame: number | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const publish = () => {
      frame = null;
      root.style.setProperty(APP_VIEWPORT_HEIGHT_VAR, `${viewport.height}px`);
      root.style.setProperty(APP_VIEWPORT_TOP_VAR, `${viewport.offsetTop}px`);
    };

    // Les événements arrivent en rafale pendant l'animation : une écriture par
    // frame suffit et évite de piétiner le style de `documentElement`.
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(publish);
    };

    const handleResize = () => {
      schedule();
      // iOS n'émet pas systématiquement un dernier `resize` une fois l'animation
      // du clavier terminée : sans cette relecture, la hauteur reste figée sur
      // une valeur intermédiaire et la barre de saisie ne redescend jamais
      // complètement en bas de l'écran.
      if (settleTimer !== null) clearTimeout(settleTimer);
      settleTimer = setTimeout(schedule, SETTLE_DELAY_MS);
    };

    publish();
    viewport.addEventListener('resize', handleResize);
    // `scroll` porte le décalage du viewport visuel, et sert accessoirement de
    // signal de fin d'animation du clavier.
    viewport.addEventListener('scroll', schedule);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      if (settleTimer !== null) clearTimeout(settleTimer);
      viewport.removeEventListener('resize', handleResize);
      viewport.removeEventListener('scroll', schedule);
      root.style.removeProperty(APP_VIEWPORT_HEIGHT_VAR);
      root.style.removeProperty(APP_VIEWPORT_TOP_VAR);
    };
  }, []);
}
