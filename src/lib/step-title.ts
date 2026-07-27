import type { Step } from '@/types/recipe';

const MAX_LEN = 40;

/**
 * Titre court d'une étape pour le mode cuisson. Priorité : `step.title` (généré
 * par l'agent) → première clause du texte (avant «,» / «.» / «;») tronquée →
 * repli « Étape N ». Fonction pure.
 */
export function deriveStepTitle(step: Step, index: number): string {
  if (step.title && step.title.trim()) return step.title.trim();
  const firstClause = step.text.split(/[,.;]/)[0]?.trim() ?? '';
  if (firstClause) {
    return firstClause.length > MAX_LEN ? `${firstClause.slice(0, MAX_LEN)}…` : firstClause;
  }
  return `Étape ${index + 1}`;
}
