import { Timer, BellRing, Pause, Play, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTimer, type CookingTimer } from '@/hooks/useCookingTimers';

interface TimerPillProps {
  timer: CookingTimer;
  onToggle: (id: string) => void;
  onDismiss: (id: string) => void;
}

function TimerPill({ timer, onToggle, onDismiss }: TimerPillProps) {
  const pct = Math.round(((timer.total - timer.remaining) / timer.total) * 100);
  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center gap-2.5 overflow-hidden rounded-xl border px-3 pb-2.5 pt-2 min-w-[138px]',
        timer.done ? 'border-accent bg-accent/20 animate-cook-pulse' : 'border-border bg-card',
      )}
    >
      {timer.done
        ? <BellRing className="h-[17px] w-[17px] shrink-0 text-accent" aria-hidden="true" />
        : <Timer className="h-[17px] w-[17px] shrink-0 text-primary" aria-hidden="true" />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-bold uppercase leading-none tracking-wide text-muted-foreground">
          {timer.done ? 'Terminé !' : timer.label}
        </div>
        <div className={cn('font-mono text-[19px] font-bold tabular-nums leading-tight', timer.done ? 'text-accent' : 'text-foreground')}>
          {formatTimer(timer.remaining)}
        </div>
      </div>
      {timer.done ? (
        <button
          onClick={() => onDismiss(timer.id)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"
          aria-label={`Arrêter le minuteur ${timer.label}`}
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : (
        <button
          onClick={() => onToggle(timer.id)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          aria-label={timer.running ? `Mettre en pause ${timer.label}` : `Reprendre ${timer.label}`}
        >
          {timer.running ? <Pause className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>
      )}
      <div
        className={cn('absolute bottom-0 left-0 h-[3px] rounded-full transition-[width] duration-1000 ease-linear', timer.done ? 'bg-accent' : 'bg-primary')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

interface CookingTimerBarProps {
  timers: CookingTimer[];
  onToggle: (id: string) => void;
  onDismiss: (id: string) => void;
}

export function CookingTimerBar({ timers, onToggle, onDismiss }: CookingTimerBarProps) {
  if (timers.length === 0) return null;
  return (
    <div className="shrink-0 border-b border-t border-border bg-muted/30">
      <div className="flex items-center gap-2 overflow-x-auto px-3.5 py-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {timers.map(timer => (
          <TimerPill key={timer.id} timer={timer} onToggle={onToggle} onDismiss={onDismiss} />
        ))}
      </div>
    </div>
  );
}
