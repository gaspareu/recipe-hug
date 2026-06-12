// Constantes d'animation partagées (framer-motion), alignées sur les tokens
// d'easing CSS définis dans src/index.css (--ease-emphasized / --ease-standard).

/** Courbe d'accent : ouvertures, morph shared-element. */
export const easeEmphasized = [0.2, 0, 0, 1] as const;

/** Courbe standard : transitions de page et micro-interactions. */
export const easeStandard = [0.4, 0, 0.2, 1] as const;

/** Variants de transition de page (fade + léger glissement vertical). */
export const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
} as const;

/** Transition par défaut pour les pages. */
export const pageTransition = { duration: 0.22, ease: easeStandard } as const;

/** Variants d'entrée d'un message de chat. */
export const messageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
} as const;

export const messageTransition = { duration: 0.25, ease: easeStandard } as const;

/** Variants d'apparition "fade + glissement vers le haut" pour sections/cartes. */
export const fadeInUpVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
} as const;

/** Transition fade-in-up avec délai optionnel pour effet échelonné (ex: liste de cartes). */
export function fadeInUpTransition(index = 0) {
  return { duration: 0.25, ease: easeStandard, delay: index * 0.05 };
}
