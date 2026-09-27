import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, CalendarDays, X, Utensils, Plus } from 'lucide-react';
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { motion, useReducedMotion } from 'framer-motion';
import { fadeInUpVariants, fadeInUpTransition } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useQueryClient } from '@tanstack/react-query';
import { useRecipes } from '@/hooks/useRecipes';
import { useMealPlans, useAddMealPlan, useDeleteMealPlan, type MealPlansData } from '@/hooks/useMealPlans';
import { GroceryListSheet } from '@/components/meal-planning/GroceryListSheet';
import { toast } from '@/components/ui/sonner';

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Petit-déj', icon: '☀️' },
  { key: 'lunch', label: 'Déjeuner', icon: '🍽️' },
  { key: 'dinner', label: 'Dîner', icon: '🌙' },
] as const;

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

interface AddingMeal {
  dayIndex: number;
  mealType: string;
}

export default function MealPlanning() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const addMealPlan = useAddMealPlan();
  const deleteMealPlan = useDeleteMealPlan();

  const [currentDate, setCurrentDate] = useState(new Date());
  const weekStart = useMemo(() => {
    const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
    return format(ws, 'yyyy-MM-dd');
  }, [currentDate]);

  const { data, isLoading } = useMealPlans(weekStart);
  const meals = useMemo(() => data?.entries ?? [], [data]);
  const recipesMap = useMemo(() => data?.recipesMap ?? {}, [data]);

  const { data: allRecipes = [] } = useRecipes();

  // Add meal dialog state
  const [addingMeal, setAddingMeal] = useState<AddingMeal | null>(null);
  const [recipeSearch, setRecipeSearch] = useState('');
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [customMealText, setCustomMealText] = useState('');
  const isAdding = addMealPlan.isPending;

  const filteredRecipes = useMemo(() => {
    if (!recipeSearch.trim()) return allRecipes.slice(0, 8);
    const q = recipeSearch.toLowerCase();
    return allRecipes.filter(r => r.title.toLowerCase().includes(q)).slice(0, 8);
  }, [allRecipes, recipeSearch]);

  const openAddDialog = (dayIndex: number, mealType: string) => {
    setAddingMeal({ dayIndex, mealType });
    setRecipeSearch('');
    setSelectedRecipeId(null);
    setCustomMealText('');
  };

  const closeAddDialog = () => {
    setAddingMeal(null);
    setRecipeSearch('');
    setSelectedRecipeId(null);
    setCustomMealText('');
  };

  const addMealPlanEntry = async () => {
    if (!addingMeal || (!selectedRecipeId && !customMealText.trim())) return;
    try {
      await addMealPlan.mutateAsync({
        weekStart,
        dayIndex: addingMeal.dayIndex,
        mealType: addingMeal.mealType,
        recipeId: selectedRecipeId ?? null,
        customMeal: selectedRecipeId ? null : customMealText.trim(),
      });
      closeAddDialog();
    } catch (err) {
      console.error('Erreur ajout repas:', err);
      toast('Erreur lors de l\'ajout du repas');
    }
  };

  const groceryData = useMemo(() => {
    const allIngredients: Array<{ name: string; quantity: number | string | null; unit: string | null; category: string }> = [];
    const customMeals: string[] = [];

    for (const meal of meals) {
      if (meal.recipe_id && recipesMap[meal.recipe_id]) {
        const recipe = recipesMap[meal.recipe_id];
        const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
        for (const ing of ingredients) {
          allIngredients.push({
            name: ing.name || '',
            quantity: ing.quantity ?? null,
            unit: ing.unit ?? null,
            category: ing.category || 'Autres',
          });
        }
      } else if (meal.custom_meal) {
        if (!customMeals.includes(meal.custom_meal)) {
          customMeals.push(meal.custom_meal);
        }
      }
    }

    return { ingredients: allIngredients, customMeals };
  }, [meals, recipesMap]);

  const weekDays = useMemo(() => {
    const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  }, [currentDate]);

  const getMeal = (dayIndex: number, mealType: string) => {
    return meals.find(m => m.day_of_week === dayIndex && m.meal_type === mealType);
  };

  const deleteMeal = (mealId: string) => {
    // Snapshot for undo
    const previousData = queryClient.getQueryData(['meal_plans', weekStart]);

    // Optimistic remove
    queryClient.setQueryData(['meal_plans', weekStart], (old: MealPlansData | undefined) => {
      if (!old) return old;
      return { ...old, entries: old.entries.filter(e => e.id !== mealId) };
    });

    // Suppression réelle une fois le toast clos (sauf si l'utilisateur annule).
    const commitDelete = async () => {
      try {
        await deleteMealPlan.mutateAsync(mealId);
      } catch (error) {
        console.error('Erreur suppression:', error);
        queryClient.setQueryData(['meal_plans', weekStart], previousData);
        toast('Erreur lors de la suppression');
      }
    };

    toast('Repas supprimé', {
      action: {
        label: 'Annuler',
        onClick: () => {
          queryClient.setQueryData(['meal_plans', weekStart], previousData);
        },
      },
      onDismiss: commitDelete,
      onAutoClose: commitDelete,
      duration: 4000,
    });
  };

  const today = new Date();

  const canAdd = selectedRecipeId !== null || customMealText.trim().length > 0;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col pt-[env(safe-area-inset-top)]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-xs border-b border-border">
        <div className="container max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Retour" className="h-11 w-11">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold text-foreground">Planning repas</h1>
          <div className="flex items-center gap-1">
            <GroceryListSheet
              ingredients={groceryData.ingredients}
              customMeals={groceryData.customMeals}
              hasMeals={meals.length > 0}
            />
            <Button variant="ghost" size="icon" onClick={() => navigate('/home')} aria-label="Demander à Chef" className="h-11 w-11">
              <Utensils className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col pb-[env(safe-area-inset-bottom)]">
      {/* Week navigator */}
      <div className="container max-w-4xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => setCurrentDate(d => subWeeks(d, 1))} aria-label="Semaine précédente" className="h-11 w-11">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span>
              {format(weekDays[0], 'd MMM', { locale: fr })} — {format(weekDays[6], 'd MMM yyyy', { locale: fr })}
            </span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setCurrentDate(d => addWeeks(d, 1))} aria-label="Semaine suivante" className="h-11 w-11">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Planning grid */}
      <div className="flex-1 container max-w-4xl mx-auto px-4 pb-6">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {weekDays.map((day, dayIndex) => {
              const dayMeals = MEAL_TYPES.map(mt => ({ ...mt, meal: getMeal(dayIndex, mt.key) }));
              const isToday = isSameDay(day, today);

              return (
                <motion.div
                  key={dayIndex}
                  variants={fadeInUpVariants}
                  transition={fadeInUpTransition(dayIndex)}
                  initial={reduceMotion ? false : 'initial'}
                  animate="animate"
                >
                  <Card
                    className={`p-3 rounded-2xl ${isToday ? 'border-accent bg-primary/5' : ''}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-sm font-semibold ${isToday ? 'text-primary' : 'text-foreground'}`}>
                        {DAY_NAMES[dayIndex]}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(day, 'd MMM', { locale: fr })}
                      </span>
                      {isToday && (
                        <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                          Aujourd'hui
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      {dayMeals.map(({ key, label, icon, meal }) => {
                        if (meal) {
                          const title = meal.recipe_title || meal.custom_meal || 'Repas';
                          return (
                            <div key={key} className="flex min-h-11 items-center justify-between gap-2 group">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span aria-hidden="true" className="text-xs shrink-0">{icon}</span>
                                <span className="text-xs text-muted-foreground shrink-0 w-14">{label}</span>
                                {meal.recipe_id ? (
                                  <Link to={`/recipes/${meal.recipe_id}`} className="min-w-0 flex-1 min-h-11 flex items-center text-sm text-primary font-medium hover:underline focus-visible:underline rounded-md focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
                                    <span className="truncate">{title}</span>
                                  </Link>
                                ) : (
                                  <span className="min-w-0 truncate text-sm text-foreground">{title}</span>
                                )}
                              </div>
                              <button
                                onClick={() => deleteMeal(meal.id)}
                                aria-label={`Supprimer ${label} du ${DAY_NAMES[dayIndex]} ${format(day, 'd MMM', { locale: fr })} : ${title}`}
                                className="h-11 w-11 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors shrink-0 rounded-md focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          );
                        }

                        return (
                          <button
                            key={key}
                            onClick={() => openAddDialog(dayIndex, key)}
                            aria-label={`Ajouter ${label} le ${DAY_NAMES[dayIndex]} ${format(day, 'd MMM', { locale: fr })}`}
                            className="flex min-h-11 items-center gap-2 w-full text-left group/add rounded-md focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span aria-hidden="true" className="text-xs shrink-0 opacity-40">{icon}</span>
                            <span className="text-xs text-muted-foreground shrink-0 w-14">{label}</span>
                            <span className="flex items-center gap-1 text-xs text-primary group-hover/add:underline transition-colors">
                              <Plus className="h-3 w-3" />
                              Ajouter
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
      </main>

      {/* Add meal dialog */}
      <Dialog open={addingMeal !== null} onOpenChange={open => { if (!open) closeAddDialog(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {addingMeal && (() => {
                const mt = MEAL_TYPES.find(m => m.key === addingMeal.mealType);
                const day = weekDays[addingMeal.dayIndex];
                return `${mt?.icon} ${mt?.label} — ${DAY_NAMES[addingMeal.dayIndex]} ${format(day, 'd MMM', { locale: fr })}`;
              })()}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Recipe search */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Choisir une recette</p>
              <Input
                className="rounded-2xl focus-visible:ring-accent"
                placeholder="Rechercher…"
                value={recipeSearch}
                onChange={e => {
                  setRecipeSearch(e.target.value);
                  setSelectedRecipeId(null);
                }}
              />
              {filteredRecipes.length > 0 && (
                <div className="border rounded-md divide-y max-h-44 overflow-y-auto">
                  {filteredRecipes.map(recipe => (
                    <button
                      key={recipe.id}
                      onClick={() => {
                        setSelectedRecipeId(recipe.id);
                        setRecipeSearch(recipe.title);
                        setCustomMealText('');
                      }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-accent ${selectedRecipeId === recipe.id ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'}`}
                    >
                      {recipe.title}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">ou</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Free text */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Repas libre</p>
              <Input
                className="rounded-2xl focus-visible:ring-accent"
                placeholder="Ex : Pasta bolognaise maison"
                value={customMealText}
                onChange={e => {
                  setCustomMealText(e.target.value);
                  if (e.target.value.trim()) {
                    setSelectedRecipeId(null);
                    setRecipeSearch('');
                  }
                }}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeAddDialog}>Annuler</Button>
            <Button onClick={addMealPlanEntry} disabled={!canAdd || isAdding}>
              {isAdding ? 'Ajout…' : 'Ajouter'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
