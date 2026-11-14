import { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { pageVariants, pageTransition } from '@/lib/motion';

interface PageTransitionProps {
  children: ReactNode;
}

/**
 * Anime brièvement l’entrée de la page.
 * Respecte la préférence de réduction des mouvements.
 */
export function PageTransition({ children }: PageTransitionProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      variants={pageVariants}
      initial={reduceMotion ? false : "initial"}
      animate="animate"
      transition={pageTransition}
      className="min-h-dvh"
    >
      {children}
    </motion.div>
  );
}
