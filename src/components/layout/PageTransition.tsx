import { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { pageVariants, pageTransition } from '@/lib/motion';

interface PageTransitionProps {
  children: ReactNode;
}

/**
 * Enveloppe une page pour animer son entrée/sortie sous <AnimatePresence>.
 * Respecte prefers-reduced-motion (simple fondu sans glissement).
 */
export function PageTransition({ children }: PageTransitionProps) {
  const reduceMotion = useReducedMotion();

  const variants = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : pageVariants;

  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="min-h-[100dvh]"
    >
      {children}
    </motion.div>
  );
}
