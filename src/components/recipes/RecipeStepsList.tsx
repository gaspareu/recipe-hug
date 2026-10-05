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
    <ol className="flex flex-col gap-6">
      {sorted.map((step, index) => (
        <li key={step.order} className="flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-sans text-sm text-primary">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            {(step.title || (step.duration_minutes != null && step.duration_minutes > 0)) && <div className="flex flex-wrap items-baseline justify-between gap-2">
              {step.title && <h3 className="font-semibold">{step.title}</h3>}
              {step.duration_minutes != null && step.duration_minutes > 0 && <span className="text-sm tabular-nums text-muted-foreground">{step.duration_minutes} min</span>}
            </div>}
            <p className="text-base leading-relaxed text-foreground">{step.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
