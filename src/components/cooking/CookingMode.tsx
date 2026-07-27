import { useEffect, useMemo, useState } from 'react';
import { X, ChevronLeft, ArrowRight, Check, Mic, ChefHat, ChevronUp } from 'lucide-react';
import type { Recipe, Step, Ingredient } from '@/types/recipe';
import { useCookingTimers } from '@/hooks/useCookingTimers';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useRecipeChat } from '@/hooks/useRecipeChat';
import { playChime } from '@/lib/playChime';
import { CookingTimerBar } from './CookingTimerBar';
import { CookingStepFocus } from './CookingStepFocus';
import { CookingDone } from './CookingDone';
import { CookingChatSheet } from './CookingChatSheet';

interface CookingModeProps {
  recipe: Recipe;
  onClose: () => void;
  onRecipeUpdate?: (data: { title: string; servings: number; ingredients: Ingredient[]; steps: Step[] }) => Promise<void>;
  onRecipeCreate?: (data: { title: string; servings: number; ingredients: Ingredient[]; steps: Step[]; relationToOriginal?: string }) => Promise<void>;
}

export function CookingMode({ recipe, onClose, onRecipeUpdate, onRecipeCreate }: CookingModeProps) {
  const sortedSteps = useMemo(
    () => [...recipe.steps].sort((a, b) => a.order - b.order),
    [recipe.steps],
  );
  const total = sortedSteps.length;

  const [idx, setIdx] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatAutoListen, setChatAutoListen] = useState(false);
  const done = idx >= total;

  const { timers, addTimer, toggleTimer, dismissTimer } = useCookingTimers({ onTimerDone: playChime });
  const { request: requestWakeLock } = useWakeLock();

  // Garde l'écran allumé pendant toute la session de cuisine (non désactivable :
  // on ne veut pas que l'écran s'éteigne au milieu d'une recette).
  useEffect(() => { void requestWakeLock(); }, [requestWakeLock]);

  // Étapes déjà franchies, transmises à Chef pour qu'il connaisse la progression.
  const completedSteps = useMemo(
    () => new Set(sortedSteps.slice(0, idx).map(s => s.order)),
    [sortedSteps, idx],
  );

  const chat = useRecipeChat({ recipe, completedSteps, onRecipeUpdate, onRecipeCreate });

  const next = () => setIdx(i => Math.min(i + 1, total));
  const prev = () => setIdx(i => Math.max(i - 1, 0));
  const restart = () => setIdx(0);

  const openChat = (autoListen: boolean) => { setChatAutoListen(autoListen); setChatOpen(true); };
  const handleChatOpenChange = (open: boolean) => { setChatOpen(open); if (!open) setChatAutoListen(false); };

  const currentStep = sortedSteps[Math.min(idx, total - 1)];

  // Minuteur en cours lié à l'étape affichée (au plus un, vu que TimerChip les
  // étiquette « Étape N »), pour l'afficher en grand plutôt que dans la barre.
  const currentTimer = (!done && timers.find(t => t.label === `Étape ${idx + 1}` && !t.done)) || null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background pt-[env(safe-area-inset-top)]">
      {/* En-tête */}
      <header className="flex shrink-0 items-center justify-between px-3.5 pb-2.5 pt-3">
        <button
          onClick={onClose}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-full text-foreground hover:bg-muted"
          aria-label="Quitter le mode cuisine"
        >
          <X className="h-[19px] w-[19px]" aria-hidden="true" />
        </button>
        <div className="px-2 text-center leading-tight">
          <div className="font-crimson text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Mode cuisson
          </div>
          <div className="mt-0.5 max-w-[200px] truncate font-solitreo text-lg text-foreground">{recipe.title}</div>
        </div>
        {/* Spacer pour garder le titre centré (le wake lock est actif en
            permanence, sans contrôle utilisateur). */}
        <span className="h-[38px] w-[38px]" aria-hidden="true" />
      </header>

      {/* Barre de minuteurs actifs (le minuteur de l'étape courante est affiché
          en grand ci-dessous, pas dans la barre — on évite le doublon). */}
      <CookingTimerBar timers={timers.filter(t => t.id !== currentTimer?.id)} onToggle={toggleTimer} onDismiss={dismissTimer} />

      {/* Corps */}
      <div className="relative min-h-0 flex-1">
        {done || !currentStep ? (
          <CookingDone recipeTitle={recipe.title} onRestart={restart} />
        ) : (
          <CookingStepFocus
            step={currentStep}
            idx={idx}
            total={total}
            onStartTimer={addTimer}
            activeTimer={currentTimer}
            onToggleTimer={toggleTimer}
          />
        )}
      </div>

      {/* Navigation + micro */}
      {!done && currentStep && (
        <div className="flex shrink-0 items-center gap-2.5 border-t border-border bg-background px-3.5 pb-2.5 pt-3">
          <button
            onClick={prev}
            disabled={idx === 0}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground disabled:opacity-35"
            aria-label="Étape précédente"
          >
            <ChevronLeft className="h-[22px] w-[22px]" aria-hidden="true" />
          </button>
          <button
            onClick={next}
            className="flex h-[54px] flex-1 items-center justify-center gap-2 rounded-2xl bg-primary font-crimson text-lg font-bold text-primary-foreground"
          >
            {idx === total - 1 ? 'Terminer' : 'Étape suivante'}
            {idx === total - 1
              ? <Check className="h-5 w-5" aria-hidden="true" />
              : <ArrowRight className="h-5 w-5" aria-hidden="true" />}
          </button>
          <button
            onClick={() => openChat(true)}
            className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"
            aria-label="Demander à Chef à la voix"
          >
            <Mic className="h-[23px] w-[23px]" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Accès au chat Chef (replié) */}
      {!chatOpen && (
        <button
          onClick={() => openChat(false)}
          className="flex w-full shrink-0 items-center gap-2.5 border-t border-border bg-card px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 text-left"
        >
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-primary/10">
            <ChefHat className="h-[17px] w-[17px] text-primary" aria-hidden="true" />
          </span>
          <span className="flex-1 font-crimson text-[15.5px] text-muted-foreground">Une question ? Demandez à Chef…</span>
          <ChevronUp className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </button>
      )}

      <CookingChatSheet
        open={chatOpen}
        onOpenChange={handleChatOpenChange}
        autoListen={chatAutoListen}
        messages={chat.messages}
        isStreaming={chat.isStreaming}
        pendingRecipe={chat.pendingRecipe}
        isSavingRecipe={chat.isSavingRecipe}
        sendMessage={chat.sendMessage}
        savePendingRecipe={chat.savePendingRecipe}
        cancelPendingRecipe={chat.cancelPendingRecipe}
        regenerateResponse={chat.regenerateResponse}
        stopGeneration={chat.stopGeneration}
      />
    </div>
  );
}
