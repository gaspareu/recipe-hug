import { useMemo } from 'react';
import { Timer } from 'lucide-react';
import type { Ingredient, Step } from '@/types/recipe';
import { cn } from '@/lib/utils';
import { parseStepTimers } from '@/lib/parseStepTimers';
import { formatTimer } from '@/hooks/useCookingTimers';
import { deriveStepTitle } from '@/lib/step-title';
import { annotateCookingText, formatCookingQuantity } from '@/lib/cooking-ingredients';

function Progress({ idx, total }: { idx: number; total: number }) {
  return (
    <div className="mb-5 flex items-center justify-between">
      <span className="text-[13px] font-bold uppercase tracking-wide text-muted-foreground">
        Étape {idx + 1} sur {total}
      </span>
      <div className="flex gap-1.5" aria-hidden="true">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-[7px] rounded-full transition-[width] duration-200',
              i < idx ? 'w-[7px] bg-primary' : i === idx ? 'w-[22px] bg-accent' : 'w-[7px] bg-border',
            )}
          />
        ))}
      </div>
    </div>
  );
}

interface TimerChipProps {
  minutes: number;
  label: string;
  stepIndex: number;
  onStart: (label: string, seconds: number, stepIndex: number) => void;
}

function TimerChip({ minutes, label, stepIndex, onStart }: TimerChipProps) {
  return (
    <button
      onClick={() => onStart(label, minutes * 60, stepIndex)}
      className="inline-flex min-h-11 touch-manipulation cursor-pointer items-center gap-2 rounded-full border-[1.5px] border-accent bg-accent/15 px-3 py-1.5 font-crimson text-sm font-bold text-secondary transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Timer className="h-4 w-4" aria-hidden="true" />
      <span>Minuteur {formatTimer(minutes * 60)}</span>
    </button>
  );
}

interface CookingStepFocusProps {
  step: Step;
  idx: number;
  total: number;
  ingredients: Ingredient[];
  onStartTimer: (label: string, seconds: number, stepIndex: number) => void;
  /** Un minuteur non terminé est déjà rattaché à l'étape courante. */
  hasActiveTimer: boolean;
}

function formatAnnotatedQuantity(
  ingredient: Ingredient,
  withoutUnit = false,
  replacementUnit?: string,
): string {
  const unit = withoutUnit ? '' : replacementUnit ?? ingredient.unit;
  return formatCookingQuantity({ ...ingredient, unit });
}

export function CookingStepFocus({
  step,
  idx,
  total,
  ingredients,
  onStartTimer,
  hasActiveTimer,
}: CookingStepFocusProps) {
  const { segments, offeredMinutes } = useMemo(() => {
    const parsed = parseStepTimers(step.text);
    // Durées proposées : celles repérées dans le texte, complétées par la durée
    // structurée de l'étape si elle n'est pas déjà détectée.
    const minutes = [...parsed.durations];
    if (step.duration_minutes && !minutes.includes(step.duration_minutes)) {
      minutes.push(step.duration_minutes);
    }
    return { segments: parsed.segments, offeredMinutes: minutes };
  }, [step.text, step.duration_minutes]);

  const stepLabel = `Étape ${idx + 1}`;
  const titleSegments = useMemo(
    () => annotateCookingText(deriveStepTitle(step, idx), ingredients),
    [step, idx, ingredients],
  );
  const title = useMemo(
    () => titleSegments
      .map(part => {
        if (!part.ingredient || part.replacementSuffix === undefined) return part.text;
        return `${formatAnnotatedQuantity(part.ingredient, part.quantityWithoutUnit, part.replacementUnit)}${part.replacementSuffix}`;
      })
      .join(''),
    [titleSegments],
  );
  const annotatedSegments = useMemo(
    () => segments.map(segment => segment.isDuration ? [] : annotateCookingText(segment.text, ingredients)),
    [segments, ingredients],
  );
  const annotatedIngredients = useMemo(
    () => new Set([
      ...titleSegments.flatMap(part => part.ingredient && part.replacementSuffix !== undefined ? [part.ingredient] : []),
      ...annotatedSegments.flatMap(parts => parts.flatMap(part => part.ingredient ? [part.ingredient] : [])),
    ]),
    [titleSegments, annotatedSegments],
  );
  const missingIngredients = ingredients.filter(ingredient => !annotatedIngredients.has(ingredient));

  return (
    <div className="flex h-full flex-col overflow-y-auto px-[22px] pb-4 pt-[22px] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <Progress idx={idx} total={total} />
      <div key={idx} className="flex-1 animate-cook-fade-up">
        <h2 className="mb-3 text-center font-solitreo text-4xl leading-tight text-primary [text-wrap:pretty]">
          {title}
        </h2>
        <p className="mt-1 font-crimson text-[25px] leading-relaxed text-foreground [text-wrap:pretty]">
          {segments.map((seg, i) =>
            seg.isDuration ? (
              <strong
                key={i}
                className="whitespace-nowrap font-bold text-secondary underline decoration-accent/70 underline-offset-[3px]"
              >
                {seg.text}
              </strong>
            ) : (
              annotatedSegments[i].map((part, partIndex) => {
                const quantity = part.ingredient
                  ? formatAnnotatedQuantity(part.ingredient, part.quantityWithoutUnit, part.replacementUnit)
                  : '';
                if (!part.ingredient || !quantity) return <span key={`${i}-${partIndex}`}>{part.text}</span>;
                return part.replacementSuffix !== undefined ? (
                  <span key={`${i}-${partIndex}`}>
                    <strong className="whitespace-nowrap font-bold text-secondary underline decoration-accent/70 underline-offset-[3px]">
                      {quantity}
                    </strong>
                    {part.replacementSuffix}
                  </span>
                ) : (
                  <span key={`${i}-${partIndex}`}>
                    {part.text}{' '}
                    <strong className="whitespace-nowrap font-bold text-secondary underline decoration-accent/70 underline-offset-[3px]">
                      ({quantity})
                    </strong>
                  </span>
                );
              })
            ),
          )}
        </p>

        {missingIngredients.length > 0 && (
          <p className="mt-4 font-crimson text-base leading-snug text-muted-foreground">
            <strong className="font-bold text-foreground">À prévoir : </strong>
            {missingIngredients.map((ingredient, ingredientIndex) => {
              const quantity = formatCookingQuantity(ingredient);
              return (
                <span key={`${ingredient.name}-${ingredientIndex}`}>
                  {ingredientIndex > 0 && ' · '}
                  {quantity && <strong className="font-bold text-secondary">{quantity} </strong>}
                  {ingredient.name}
                </span>
              );
            })}
          </p>
        )}

        {!hasActiveTimer && offeredMinutes.length > 0 && (
          <div className="mt-[18px] flex flex-wrap gap-2">
            {offeredMinutes.map((min, i) => (
              <TimerChip key={i} minutes={min} label={stepLabel} stepIndex={idx} onStart={onStartTimer} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
