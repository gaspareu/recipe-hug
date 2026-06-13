import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRecipes } from '@/hooks/useRecipes';
import type { Ingredient } from '@/types/recipe';
import { GroceryListSheet } from '@/components/meal-planning/GroceryListSheet';
import { toast } from '@/components/ui/sonner';

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Petit-déj', icon: '☀️' },
  { key: 'lunch', label: 'Déjeuner', icon: '🍽️' },
  { key: 'dinner', label: 'Dîner', icon: '🌙' },
] as const;

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

interface MealPlanEntry {
  id: string;
  day_of_week: number;
  meal_type: string;
  recipe_id: string | null;
  custom_meal: string | null;
  notes: string | null;
  recipe_title?: string;
}

interface RecipeWithIngredients {
  id: string;
  title: string;
  ingredients: Ingredient[];
}

interface AddingMeal {
  dayIndex: number;
  mealType: string;
}

function useMealPlans(weekStart: string) {
  return useQuery({
    queryKey: ['meal_plans', weekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meal_plans')
        .select('id, day_of_week, meal_type, recipe_id, custom_meal, notes')
        .eq('week_start', weekStart);
      if (error) throw error;

      const recipeIds = (data || []).filter(m => m.recipe_id).map(m => m.recipe_id!);
      let recipesMap: Record<string, RecipeWithIngredients> = {};
      if (recipeIds.length > 0) {
        const { data: recipes } = await supabase
          .from('recipes')
          .select('id, title, ingredients')
          .in('id', recipeIds);
        if (recipes) {
          recipesMap = Object.fromEntries(recipes.map(r => [r.id, r as unknown as RecipeWithIngredients]));
        }
      }

      const entries = (data || []).map(m => ({
        ...m,
        recipe_title: m.recipe_id ? recipesMap[m.recipe_id]?.title : undefined,
      })) as MealPlanEntry[];

      return { entries, recipesMap };
    },
  });
}

export default function MealPlanning() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();

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
  const [isAdding, setIsAdding] = useState(false);

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
    setIsAdding(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Non authentifié');

      const entry = {
        user_id: authUser.id,
        week_start: weekStart,
        day_of_week: addingMeal.dayIndex,
        meal_type: addingMeal.mealType,
        recipe_id: selectedRecipeId ?? null,
        custom_meal: selectedRecipeId ? null : customMealText.trim(),
        notes: null,
      };

      const { error } = await supabase.from('meal_plans').insert([entry]);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['meal_plans', weekStart] });
      closeAddDialog();
    } catch (err) {
      console.error('Erreur ajout repas:', err);
      toast('Erreur lors de l\'ajout du repas');
    } finally {
      setIsAdding(false);
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

  const deleteMeal = async (mealId: string, mealLabel: string) => {
    // Snapshot for undo
    const previousData = queryClient.getQueryData(['meal_plans', weekStart]);

    // Optimistic remove
    queryClient.setQueryData(['meal_plans', weekStart], (old: typeof data) => {
      if (!old) return old;
      return { ...old, entries: old.entries.filter(e => e.id !== mealId) };
    });

    toast('Repas supprimé', {
      action: {
        label: 'Annuler',
        onClick: () => {
          queryClient.setQueryData(['meal_plans', weekStart], previousData);
        },
      },
      onDismiss: async () => {
        const { error } = await supabase.from('meal_plans').delete().eq('id', mealId);
        if (error) {
          console.error('Erreur suppression:', error);
          queryClient.setQueryData(['meal_plans', weekStart], previousData);
          toast('Erreur lors de la suppression');
        }
      },
      onAutoClose: async () => {
        const { error } = await supabase.from('meal_plans').delete().eq('id', mealId);
        if (error) {
          console.error('Erreur suppression:', error);
          queryClient.setQueryData(['meal_plans', weekStart], previousData);
          toast('Erreur lors de la suppression');
        }
      },
      duration: 4000,
    });
  };

  const today = new Date();

  const canAdd = selectedRecipeId !== null || customMealText.trim().length > 0;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col pt-[env(safe-area-inset-top)]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="container max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold text-foreground">Planning repas</h1>
          <div className="flex items-center gap-1">
            <GroceryListSheet
              ingredients={groceryData.ingredients}
              customMeals={groceryData.customMeals}
              hasMeals={meals.length > 0}
            />
            <Button variant="ghost" size="icon" onClick={() => navigate('/home')} title="Demander à Chef" className="h-9 w-9">
              <Utensils className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Week navigator */}
      <div className="container max-w-4xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => setCurrentDate(d => subWeeks(d, 1))} className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span>
              {format(weekDays[0], 'd MMM', { locale: fr })} — {format(weekDays[6], 'd MMM yyyy', { locale: fr })}
            </span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setCurrentDate(d => addWeeks(d, 1))} className="h-8 w-8">
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
                            <div key={key} className="flex items-center justify-between group">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs shrink-0">{icon}</span>
                                <span className="text-xs text-muted-foreground shrink-0 w-14">{label}</span>
                                <span
                                  className={`text-sm truncate ${meal.recipe_id ? 'text-primary font-medium cursor-pointer hover:underline' : 'text-foreground'}`}
                                  onClick={() => meal.recipe_id && navigate(`/recipes/${meal.recipe_id}`)}
                                >
                                  {title}
                                </span>
                              </div>
                              <button
                                onClick={() => deleteMeal(meal.id, title)}
                                aria-label={`Supprimer ${title}`}
                                className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors shrink-0"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        }

                        return (
                          <button
                            key={key}
                            onClick={() => openAddDialog(dayIndex, key)}
                            aria-label={`Ajouter ${label} le ${DAY_NAMES[dayIndex]} ${format(day, 'd MMM', { locale: fr })}`}
                            className="flex items-center gap-2 w-full text-left group/add"
                          >
                            <span className="text-xs shrink-0 opacity-40">{icon}</span>
                            <span className="text-xs text-muted-foreground/50 shrink-0 w-14">{label}</span>
                            <span className="flex items-center gap-1 text-xs text-primary/50 group-hover/add:text-primary transition-colors">
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
