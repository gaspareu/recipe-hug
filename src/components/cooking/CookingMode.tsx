import { useEffect, useMemo, useState } from 'react';
import { X, ChevronLeft, ArrowRight, Check, Mic, ChefHat, ChevronUp } from 'lucide-react';
import type { Recipe } from '@/types/recipe';
import { useCookingTimers } from '@/hooks/useCookingTimers';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useRecipeChat, type RecipeChatSession } from '@/hooks/useRecipeChat';
import { playChime } from '@/lib/playChime';
import { CookingTimerBar } from './CookingTimerBar';
import { CookingStepFocus } from './CookingStepFocus';
import { CookingDone } from './CookingDone';
import { CookingChatSheet } from './CookingChatSheet';
import { CookingIngredientsSheet } from './CookingIngredientsSheet';
import { scaleIngredients } from '@/lib/recipe-scaling';
import { getStepIngredients } from '@/lib/cooking-ingredients';
import type { PendingRecipe } from '@/hooks/useChatEngine';

const MIN_SERVINGS = 1;
const DEFAULT_SERVINGS = 2;

function clampServings(value: number): number {
  return Math.max(MIN_SERVINGS, Math.round(value));
}

interface CookingModeProps {
  recipe: Recipe;
  onClose: () => void;
  initialServings?: number;
  chatSession?: RecipeChatSession;
  onRecipeUpdate?: (data: PendingRecipe) => Promise<void>;
  onRecipeCreate?: (data: PendingRecipe) => Promise<string>;
  onStartCooking?: (recipeId: string, servings?: number) => void;
}

export function CookingMode({ recipe, onClose, initialServings, chatSession, onRecipeUpdate, onRecipeCreate, onStartCooking }: CookingModeProps) {
  const sortedSteps = useMemo(
    () => [...recipe.steps].sort((a, b) => a.order - b.order),
    [recipe.steps],
  );
  const total = sortedSteps.length;

  const [idx, setIdx] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatAutoListen, setChatAutoListen] = useState(false);
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const [checkedIngredientIndexes, setCheckedIngredientIndexes] = useState<Set<number>>(() => new Set());
  // Les recettes historiques sans nombre de portions utilisent le même défaut
  // que leurs cartes dans le chat. Cela évite de doubler leurs quantités à
  // l'ouverture (carte à 2 portions, base supposée à 1 auparavant).
  const baseServings = recipe.servings && recipe.servings > 0 ? recipe.servings : DEFAULT_SERVINGS;
  const [servings, setServings] = useState(() => clampServings(initialServings ?? baseServings));
  const done = idx >= total;

  const scaledIngredients = useMemo(
    () => scaleIngredients(recipe.ingredients, baseServings, servings),
    [recipe.ingredients, baseServings, servings],
  );
  const cookingRecipe = useMemo(
    () => ({ ...recipe, servings, ingredients: scaledIngredients }),
    [recipe, servings, scaledIngredients],
  );

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

  // La fiche recette peut fournir sa session afin de conserver le même fil en
  // passant au mode cuisine. La session locale reste le fallback des ouvertures
  // lancées depuis la Home.
  const localChat = useRecipeChat({ recipe: cookingRecipe, completedSteps, onRecipeUpdate, onRecipeCreate, onStartCooking });
  const chat = chatSession ?? localChat;
  const syncChatContext = chat.syncContext;

  useEffect(() => {
    syncChatContext(cookingRecipe, completedSteps);
  }, [syncChatContext, cookingRecipe, completedSteps]);

  const resetCookingChat = () => {
    chat.resetChat();
    syncChatContext(cookingRecipe, completedSteps);
  };

  const startCookingFromChat = (recipeId: string, requestedServings: number) => {
    if (recipeId === recipe.id) {
      setServings(clampServings(requestedServings));
      setIdx(0);
      setChatOpen(false);
      return;
    }
    onStartCooking?.(recipeId, requestedServings);
  };

  const next = () => setIdx(i => Math.min(i + 1, total));
  const prev = () => setIdx(i => Math.max(i - 1, 0));
  const restart = () => setIdx(0);

  const openChat = (autoListen: boolean) => { setChatAutoListen(autoListen); setChatOpen(true); };
  const handleChatOpenChange = (open: boolean) => { setChatOpen(open); if (!open) setChatAutoListen(false); };

  const currentStep = sortedSteps[Math.min(idx, total - 1)];
  const currentIngredients = useMemo(
    () => currentStep ? getStepIngredients(currentStep, scaledIngredients) : [],
    [currentStep, scaledIngredients],
  );

  const toggleIngredient = (ingredientIndex: number) => {
    setCheckedIngredientIndexes(previous => {
      const next = new Set(previous);
      if (next.has(ingredientIndex)) next.delete(ingredientIndex);
      else next.add(ingredientIndex);
      return next;
    });
  };

  const hasActiveTimer = !done && timers.some(timer => timer.stepIndex === idx && !timer.done);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background pt-[env(safe-area-inset-top)]">
      {/* En-tête */}
      <header className="flex shrink-0 items-center justify-between px-3.5 pb-2.5 pt-3">
        <button
          onClick={onClose}
          className="flex h-11 w-11 touch-manipulation cursor-pointer items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
        <span className="h-11 w-11" aria-hidden="true" />
      </header>

      {/* Bande compacte : tous les minuteurs actifs et accès aux portions. */}
      <CookingTimerBar
        timers={timers}
        servings={servings}
        onOpenIngredients={() => setIngredientsOpen(true)}
        onToggle={toggleTimer}
        onDismiss={dismissTimer}
      />

      {/* Corps */}
      <div className="relative min-h-0 flex-1">
        {done || !currentStep ? (
          <CookingDone recipeTitle={recipe.title} onRestart={restart} />
        ) : (
          <CookingStepFocus
            step={currentStep}
            idx={idx}
            total={total}
            ingredients={currentIngredients}
            onStartTimer={addTimer}
            hasActiveTimer={hasActiveTimer}
          />
        )}
      </div>

      {/* Navigation + micro */}
      {!done && currentStep && (
        <div className="flex shrink-0 items-center gap-2.5 border-t border-border bg-background px-3.5 pb-2.5 pt-3">
          <button
            onClick={prev}
            disabled={idx === 0}
            className="flex h-12 w-12 shrink-0 touch-manipulation cursor-pointer items-center justify-center rounded-full border border-border bg-card text-foreground disabled:cursor-default disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Étape précédente"
          >
            <ChevronLeft className="h-[22px] w-[22px]" aria-hidden="true" />
          </button>
          <button
            onClick={next}
            className="flex h-[54px] flex-1 touch-manipulation cursor-pointer items-center justify-center gap-2 rounded-2xl bg-primary font-crimson text-lg font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {idx === total - 1 ? 'Terminer' : 'Étape suivante'}
            {idx === total - 1
              ? <Check className="h-5 w-5" aria-hidden="true" />
              : <ArrowRight className="h-5 w-5" aria-hidden="true" />}
          </button>
          <button
            onClick={() => openChat(true)}
            className="flex h-[54px] w-[54px] shrink-0 touch-manipulation cursor-pointer items-center justify-center rounded-full bg-accent text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
          className="flex w-full shrink-0 touch-manipulation cursor-pointer items-center gap-2.5 border-t border-border bg-card px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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
        recipeTitle={recipe.title}
        recipeServings={servings}
        completedStepsCount={completedSteps.size}
        context="cooking"
        messages={chat.messages}
        isStreaming={chat.isStreaming}
        toolActivity={chat.toolActivity}
        isSavingRecipe={chat.isSavingRecipe}
        sendMessage={chat.sendMessage}
        onCreateRecipe={chat.createProposedRecipe}
        onStartCooking={startCookingFromChat}
        resetChat={resetCookingChat}
        regenerateResponse={chat.regenerateResponse}
        stopGeneration={chat.stopGeneration}
      />

      <CookingIngredientsSheet
        open={ingredientsOpen}
        onOpenChange={setIngredientsOpen}
        ingredients={scaledIngredients}
        servings={servings}
        canDecreaseServings={servings > MIN_SERVINGS}
        onDecreaseServings={() => setServings(value => clampServings(value - 1))}
        onIncreaseServings={() => setServings(value => clampServings(value + 1))}
        checkedIndexes={checkedIngredientIndexes}
        onToggleIngredient={toggleIngredient}
      />
    </div>
  );
}
