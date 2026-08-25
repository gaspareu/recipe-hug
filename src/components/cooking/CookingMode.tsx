import { useEffect, useMemo, useState } from 'react';
import { X, ChevronLeft, ArrowRight, Check, Mic, ChefHat, ChevronUp, Minus, Plus, Users } from 'lucide-react';
import type { Recipe, Step, Ingredient } from '@/types/recipe';
import { useCookingTimers, findActiveStepTimer } from '@/hooks/useCookingTimers';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useRecipeChat } from '@/hooks/useRecipeChat';
import { playChime } from '@/lib/playChime';
import { CookingTimerBar } from './CookingTimerBar';
import { CookingStepFocus } from './CookingStepFocus';
import { CookingDone } from './CookingDone';
import { CookingChatSheet } from './CookingChatSheet';
import { CookingIngredientsSheet } from './CookingIngredientsSheet';
import { scaleIngredients } from '@/lib/recipe-scaling';
import { getStepIngredients } from '@/lib/cooking-ingredients';

const MIN_SERVINGS = 1;
const DEFAULT_SERVINGS = 2;

function clampServings(value: number): number {
  return Math.max(MIN_SERVINGS, Math.round(value));
}

interface CookingModeProps {
  recipe: Recipe;
  onClose: () => void;
  initialServings?: number;
  onRecipeUpdate?: (data: { title: string; servings: number; ingredients: Ingredient[]; steps: Step[] }) => Promise<void>;
  onRecipeCreate?: (data: { title: string; servings: number; ingredients: Ingredient[]; steps: Step[]; relationToOriginal?: string }) => Promise<void>;
}

export function CookingMode({ recipe, onClose, initialServings, onRecipeUpdate, onRecipeCreate }: CookingModeProps) {
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

  const chat = useRecipeChat({ recipe: cookingRecipe, completedSteps, onRecipeUpdate, onRecipeCreate });

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

  // Minuteur en cours lié à l'étape affichée, pour l'afficher en grand plutôt
  // que dans la barre.
  const currentTimer = findActiveStepTimer(timers, idx, done);

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

      {/* Portions et recalcul instantané des quantités. */}
      <div className="mx-3.5 mb-1 flex shrink-0 items-center justify-between rounded-2xl border border-border bg-card py-1.5 pl-3 pr-1.5">
        <span className="flex items-center gap-2 font-crimson text-sm font-bold text-foreground">
          <Users className="h-4 w-4 text-primary" aria-hidden="true" />
          Quantités pour
        </span>
        <div className="flex items-center gap-1" role="group" aria-label="Nombre de portions">
          <button
            type="button"
            onClick={() => setServings(value => clampServings(value - 1))}
            disabled={servings <= MIN_SERVINGS}
            className="flex h-11 w-11 touch-manipulation cursor-pointer items-center justify-center rounded-xl bg-muted text-primary transition-colors hover:bg-primary/10 disabled:cursor-default disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Diminuer les portions"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="min-w-16 text-center font-crimson text-base font-bold text-foreground" aria-live="polite">
            {servings} portion{servings > 1 ? 's' : ''}
          </span>
          <button
            type="button"
            onClick={() => setServings(value => clampServings(value + 1))}
            className="flex h-11 w-11 touch-manipulation cursor-pointer items-center justify-center rounded-xl bg-muted text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Augmenter les portions"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

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
            ingredients={currentIngredients}
            totalIngredientsCount={scaledIngredients.length}
            onOpenIngredients={() => setIngredientsOpen(true)}
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

      <CookingIngredientsSheet
        open={ingredientsOpen}
        onOpenChange={setIngredientsOpen}
        ingredients={scaledIngredients}
        servings={servings}
        checkedIndexes={checkedIngredientIndexes}
        onToggleIngredient={toggleIngredient}
      />
    </div>
  );
}
