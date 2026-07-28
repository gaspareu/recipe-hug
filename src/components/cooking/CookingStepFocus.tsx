import { useMemo } from 'react';
import { Timer, Pause, Play } from 'lucide-react';
import type { Step } from '@/types/recipe';
import { cn } from '@/lib/utils';
import { parseStepTimers } from '@/lib/parseStepTimers';
import { formatTimer, type CookingTimer } from '@/hooks/useCookingTimers';
import { deriveStepTitle } from '@/lib/step-title';

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
      className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-accent bg-accent/15 px-3 py-1.5 font-crimson text-sm font-bold text-secondary transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <Timer className="h-4 w-4" aria-hidden="true" />
      <span>Minuteur {formatTimer(minutes * 60)}</span>
    </button>
  );
}

interface ActiveTimerDisplayProps {
  timer: CookingTimer;
  onToggle: (id: string) => void;
}

function ActiveTimerDisplay({ timer, onToggle }: ActiveTimerDisplayProps) {
  return (
    <div className="mt-[18px] flex items-center gap-4">
      <span className="font-solitreo text-5xl leading-none text-primary">{formatTimer(timer.remaining)}</span>
      <button
        onClick={() => onToggle(timer.id)}
        aria-label={timer.running ? `Mettre en pause ${timer.label}` : `Reprendre ${timer.label}`}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"
      >
        {timer.running
          ? <Pause className="h-5 w-5" aria-hidden="true" />
          : <Play className="h-5 w-5" aria-hidden="true" />}
      </button>
    </div>
  );
}

interface CookingStepFocusProps {
  step: Step;
  idx: number;
  total: number;
  onStartTimer: (label: string, seconds: number, stepIndex: number) => void;
  /** Minuteur en cours lié à l'étape courante (null si aucun). */
  activeTimer: CookingTimer | null;
  onToggleTimer: (id: string) => void;
}

export function CookingStepFocus({ step, idx, total, onStartTimer, activeTimer, onToggleTimer }: CookingStepFocusProps) {
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
  const title = deriveStepTitle(step, idx);

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
              <span key={i}>{seg.text}</span>
            ),
          )}
        </p>
        {activeTimer ? (
          <ActiveTimerDisplay timer={activeTimer} onToggle={onToggleTimer} />
        ) : (
          offeredMinutes.length > 0 && (
            <div className="mt-[18px] flex flex-wrap gap-2">
              {offeredMinutes.map((min, i) => (
                <TimerChip key={i} minutes={min} label={stepLabel} stepIndex={idx} onStart={onStartTimer} />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
