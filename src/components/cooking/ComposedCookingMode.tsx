import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, X, ChefHat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCookingTimers } from '@/hooks/useCookingTimers';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useRecipeChat } from '@/hooks/useRecipeChat';
import { useCreateRecipe } from '@/hooks/useRecipes';
import type { PendingRecipe } from '@/hooks/useChatEngine';
import { toast } from '@/components/ui/sonner';
import { playChime } from '@/lib/playChime';
import { getStepIngredients } from '@/lib/cooking-ingredients';
import { resolveCookingRun, aggregateCookingIngredients, advanceCookingRun } from '@/lib/resolve-cooking-run';
import { CookingTimerBar } from './CookingTimerBar';
import { CookingStepFocus } from './CookingStepFocus';
import { CookingDone } from './CookingDone';
import { CookingChatSheet } from './CookingChatSheet';
import { CookingIngredientsSheet } from './CookingIngredientsSheet';
import { CookingModeContainer } from './CookingModeContainer';
import type { Recipe } from '@/types/recipe';
import type { Composition, CookingTarget } from '@/types/livre';

interface Props {
  target: CookingTarget;
  recipes: Recipe[];
  compositions: Composition[];
  onClose: () => void;
}

export function ComposedCookingMode({ target, recipes, compositions, onClose }: Props) {
  const [servings, setServings] = useState(target.servings);
  const [progress, setProgress] = useState<{ index: number; completed: Set<string> }>(() => ({ index: 0, completed: new Set() }));
  const index = progress.index;
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [replacementRecipe, setReplacementRecipe] = useState<{ id: string; servings?: number } | null>(null);
  const startOtherRecipe = useCallback((id: string, requestedServings?: number) => {
    setChatOpen(false);
    setReplacementRecipe({ id, servings: requestedServings });
  }, []);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(() => new Set());
  const run = useMemo(() => resolveCookingRun({ ...target, servings }, recipes, compositions), [target, servings, recipes, compositions]);
  const current = run.steps[Math.min(index, run.steps.length - 1)];
  const done = index >= run.steps.length;
  const lastStep = index === run.steps.length - 1;
  const willFinish = run.steps.every((step, stepIndex) => stepIndex === index || progress.completed.has(step.key));
  const navigationTargets = useMemo(() => run.steps.reduce<Array<{ key: string; label: string; stepIndex: number }>>((targets, step, stepIndex) => {
    if (!targets.some(target => target.key === step.segmentKey)) {
      targets.push({ key: step.segmentKey, label: `${step.course ? `${step.course} · ` : ''}${step.sourceTitle}`, stepIndex });
    }
    return targets;
  }, []), [run.steps]);
  const activeSegment = run.segments.find(segment => segment.key === current.segmentKey) ?? run.segments[run.segments.length - 1];
  const currentIngredients = current.assembly ? [] : getStepIngredients(current.step, current.ingredients);
  const { timers, addTimer, toggleTimer, dismissTimer } = useCookingTimers({ onTimerDone: playChime });
  const { request: requestWakeLock } = useWakeLock();
  const createRecipe = useCreateRecipe();
  useEffect(() => { void requestWakeLock(); }, [requestWakeLock]);

  const completedKeys = useMemo(() => run.steps.filter(step => progress.completed.has(step.key)).map(step => step.key), [run.steps, progress.completed]);
  const completedIndexes = useMemo(() => new Set(run.steps.flatMap((step, stepIndex) => progress.completed.has(step.key) ? [stepIndex] : [])), [run.steps, progress.completed]);
  const completedLocalSteps = useMemo(() => new Set(run.steps
    .filter(step => progress.completed.has(step.key))
    .filter(step => step.segmentKey === activeSegment.key && !step.assembly)
    .map(step => step.step.order)), [run.steps, progress.completed, activeSegment.key]);
  const activeRecipe = useMemo(() => ({
    ...activeSegment.recipe,
    servings,
    ingredients: activeSegment.ingredients,
  }), [activeSegment, servings]);
  const activeRecipeOverride = useMemo(() => current.assembly ? {
    id: `composition:${target.id}`,
    title: `Dressage · ${current.sourceTitle}`,
    servings,
    ingredients: [],
    steps: [current.step],
    completedSteps: [],
  } : undefined, [current, target.id, servings]);
  const compositionContext = useMemo(() => ({
    kind: target.type === 'menu' ? 'menu' as const : 'dish' as const,
    title: run.title.slice(0, 160),
    servings,
    currentStep: Math.min(index + 1, run.steps.length),
    totalSteps: run.steps.length,
    currentCourse: current.course?.slice(0, 120) ?? null,
    currentPreparation: current.sourceTitle.slice(0, 160),
    currentInstruction: current.step.text.slice(0, 2000),
    assembly: current.assembly,
    sections: navigationTargets.slice(0, 30).map(item => {
      const step = run.steps[item.stepIndex];
      return { title: step.sourceTitle.slice(0, 160), course: step.course?.slice(0, 120) ?? null };
    }),
  }), [target.type, run.title, run.steps, servings, index, current.course, current.sourceTitle, current.step.text, current.assembly, navigationTargets]);
  const chat = useRecipeChat({
    recipe: activeRecipe,
    completedSteps: completedLocalSteps,
    compositionContext,
    activeRecipeOverride,
    onRecipeCreate: async (data: PendingRecipe) => {
      const created = await createRecipe.mutateAsync({
        title: data.title, servings: data.servings, ingredients: data.ingredients, steps: data.steps,
        status: 'draft', entry_kind: null, is_favorite: false, source_type: 'ai',
        ai_summary: data.relationToOriginal ?? null, season: null, nutrition_tags: null,
        calorie_score: null, source_image_url: null,
      });
      toast('Nouvelle fiche enregistrée. Elle sera disponible dans le Livre.');
      return created.id;
    },
    onStartCooking: startOtherRecipe,
  });

  const globalIngredients = useMemo(() => aggregateCookingIngredients(run.ingredients), [run.ingredients]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background pt-[env(safe-area-inset-top)]">
      <header className="flex shrink-0 items-center justify-between px-3.5 pb-2.5 pt-3">
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Quitter le mode cuisine" className="h-11 w-11"><X className="h-5 w-5" /></Button>
        <div className="min-w-0 px-2 text-center"><p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Mode cuisine · {target.type === 'menu' ? 'Menu' : 'Plat'}</p><h2 className="max-w-[210px] truncate font-solitreo text-lg">{run.title}</h2></div>
        <span className="h-11 w-11" aria-hidden="true" />
      </header>
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-3.5 pb-2" aria-label="Accès direct aux préparations">
        {navigationTargets.map(target => <Button key={target.key} variant={!done && current.segmentKey === target.key ? 'secondary' : 'ghost'}
          size="sm" className="min-h-11 shrink-0 whitespace-nowrap" aria-current={!done && current.segmentKey === target.key ? 'step' : undefined}
          onClick={() => setProgress(previous => ({ ...previous, index: target.stepIndex }))}>{target.label}</Button>)}
      </nav>
      <CookingTimerBar timers={timers} servings={servings} onOpenIngredients={() => setIngredientsOpen(true)} onToggle={toggleTimer} onDismiss={dismissTimer} />
      {!done && <div className="border-b border-border px-4 py-2 text-sm" aria-live="polite">
        <span className="font-semibold">{current.course ? `${current.course} · ` : ''}{current.sourceTitle}</span>
        <span className="ml-2 text-muted-foreground">{index + 1}/{run.steps.length}</span>
      </div>}
      <div className="min-h-0 flex-1">
        {done ? <CookingDone recipeTitle={run.title} onRestart={() => setProgress({ index: 0, completed: new Set() })} /> :
          <CookingStepFocus step={current.step} idx={index} total={run.steps.length} ingredients={currentIngredients}
            completedIndexes={completedIndexes}
            onStartTimer={(label, seconds, stepIndex) => addTimer(`${current.sourceTitle} · ${label}`, seconds, stepIndex)}
            hasActiveTimer={timers.some(timer => timer.stepIndex === index && !timer.done)} />}
      </div>
      {!done && <nav className="flex shrink-0 gap-2 border-t border-border bg-background px-3.5 pb-3 pt-3" aria-label="Étapes de cuisine">
        <Button variant="outline" size="icon" className="h-12 w-12" disabled={index === 0} onClick={() => setProgress(previous => ({ ...previous, index: previous.index - 1 }))} aria-label="Étape précédente"><ChevronLeft className="h-5 w-5" /></Button>
        <Button className="h-12 flex-1" onClick={() => setProgress(previous => advanceCookingRun(run.steps, previous.index, previous.completed))}>{willFinish ? 'Terminer' : lastStep ? 'Reprendre les étapes restantes' : 'Étape suivante'} {willFinish ? <Check className="ml-2 h-4 w-4" /> : <ArrowRight className="ml-2 h-4 w-4" />}</Button>
      </nav>}
      <Button variant="ghost" className="h-12 w-full shrink-0 rounded-none border-t border-border pb-[env(safe-area-inset-bottom)]" onClick={() => setChatOpen(true)}><ChefHat className="mr-2 h-4 w-4" /> Chef · {current.assembly ? 'Dressage' : activeSegment.recipe.title}</Button>
      <CookingChatSheet open={chatOpen} onOpenChange={setChatOpen} autoListen={false} recipeTitle={run.title} recipeServings={servings}
        completedStepsCount={completedKeys.length} context="cooking" messages={chat.messages} isStreaming={chat.isStreaming}
        toolActivity={chat.toolActivity} isSavingRecipe={chat.isSavingRecipe} sendMessage={chat.sendMessage}
        onCreateRecipe={chat.createProposedRecipe} onStartCooking={startOtherRecipe}
        resetChat={chat.resetChat} regenerateResponse={chat.regenerateResponse}
        stopGeneration={chat.stopGeneration} />
      <CookingIngredientsSheet open={ingredientsOpen} onOpenChange={setIngredientsOpen} ingredients={globalIngredients}
        sections={run.segments.map(segment => ({ key: segment.key, title: `${segment.course ? `${segment.course} · ` : ''}${segment.recipe.title}`, ingredients: segment.ingredients }))}
        servings={servings} canDecreaseServings={servings > 1}
        onDecreaseServings={() => setServings(value => Math.max(1, value - 1))}
        onIncreaseServings={() => setServings(value => value + 1)} checkedIndexes={checkedIngredients}
        onToggleIngredient={ingredientIndex => setCheckedIngredients(previous => {
          const next = new Set(previous);
          if (next.has(ingredientIndex)) next.delete(ingredientIndex); else next.add(ingredientIndex);
          return next;
        })} />
      {replacementRecipe && <CookingModeContainer recipeId={replacementRecipe.id} initialServings={replacementRecipe.servings}
        onClose={() => setReplacementRecipe(null)} onStartCooking={startOtherRecipe} />}
    </div>
  );
}
