import { Timer, BellRing, Pause, Play, Check, Users, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTimer, type CookingTimer } from '@/hooks/useCookingTimers';

interface TimerPillProps {
  timer: CookingTimer;
  onToggle: (id: string) => void;
  onDismiss: (id: string) => void;
}

function TimerPill({ timer, onToggle, onDismiss }: TimerPillProps) {
  const handleClick = () => {
    if (timer.done) onDismiss(timer.id);
    else onToggle(timer.id);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={timer.done
        ? `Arrêter le minuteur ${timer.label}`
        : timer.running
          ? `Mettre en pause ${timer.label}`
          : `Reprendre ${timer.label}`}
      className={cn(
        'flex h-11 shrink-0 touch-manipulation cursor-pointer items-center gap-1.5 rounded-xl px-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        timer.done ? 'bg-accent/20 animate-cook-pulse' : 'hover:bg-muted',
      )}
    >
      {timer.done
        ? <BellRing className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        : <Timer className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
      <span className="min-w-0">
        <span className={cn('block font-mono text-sm font-bold tabular-nums leading-none', timer.done ? 'text-accent' : 'text-foreground')}>
          {formatTimer(timer.remaining)}
        </span>
        <span className="block max-w-16 truncate text-[10px] font-bold uppercase leading-tight tracking-wide text-muted-foreground">
          {timer.done ? 'Terminé' : timer.label}
        </span>
      </span>
      {timer.done
        ? <Check className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
        : timer.running
          ? <Pause className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          : <Play className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
    </button>
  );
}

interface CookingTimerBarProps {
  timers: CookingTimer[];
  servings: number;
  onOpenIngredients: () => void;
  onToggle: (id: string) => void;
  onDismiss: (id: string) => void;
}

export function CookingTimerBar({ timers, servings, onOpenIngredients, onToggle, onDismiss }: CookingTimerBarProps) {
  return (
    <div className="shrink-0 border-b border-t border-border bg-muted/20">
      <div className="flex min-h-14 items-center gap-1.5 px-3.5 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {timers.map(timer => (
            <TimerPill key={timer.id} timer={timer} onToggle={onToggle} onDismiss={onDismiss} />
          ))}
        </div>
        <button
          type="button"
          onClick={onOpenIngredients}
          className="flex h-11 shrink-0 touch-manipulation cursor-pointer items-center gap-1.5 rounded-xl px-2.5 font-crimson text-sm font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={`Ajuster les quantités pour ${servings} portion${servings > 1 ? 's' : ''}`}
        >
          <Users className="h-4 w-4 text-primary" aria-hidden="true" />
          <span>{servings} portion{servings > 1 ? 's' : ''}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
