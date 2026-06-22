import { useMemo } from 'react';
import type { Step } from '@/types/recipe';

interface RecipeStepsListProps {
  steps: Step[];
}

/**
 * Liste d'étapes en lecture seule (fiche recette). La cuisson interactive
 * (cochage, progression) se fait désormais dans le mode cuisine.
 */
export function RecipeStepsList({ steps }: RecipeStepsListProps) {
  const sorted = useMemo(() => [...steps].sort((a, b) => a.order - b.order), [steps]);

  if (sorted.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune étape</p>;
  }

  return (
    <ol className="flex flex-col gap-3.5">
      {sorted.map((step, index) => (
        <li key={step.order} className="flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-solitreo text-base text-primary">
            {index + 1}
          </span>
          <span className="pt-0.5 text-base leading-relaxed text-foreground">{step.text}</span>
        </li>
      ))}
    </ol>
  );
}
