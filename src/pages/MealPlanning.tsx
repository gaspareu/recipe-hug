import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, CalendarDays, X, Utensils } from 'lucide-react';
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { GroceryListSheet } from '@/components/meal-planning/GroceryListSheet';

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
  ingredients: any[];
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

      // Fetch recipe titles for entries with recipe_id
      const recipeIds = (data || []).filter(m => m.recipe_id).map(m => m.recipe_id!);
      let recipesMap: Record<string, RecipeWithIngredients> = {};
      if (recipeIds.length > 0) {
        const { data: recipes } = await supabase
          .from('recipes')
          .select('id, title, ingredients')
          .in('id', recipeIds);
        if (recipes) {
          recipesMap = Object.fromEntries(recipes.map(r => [r.id, r as RecipeWithIngredients]));
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

  const [currentDate, setCurrentDate] = useState(new Date());
  const weekStart = useMemo(() => {
    const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
    return format(ws, 'yyyy-MM-dd');
  }, [currentDate]);

  const { data, isLoading } = useMealPlans(weekStart);
  const meals = data?.entries ?? [];
  const recipesMap = data?.recipesMap ?? {};

  // Aggregate all ingredients from linked recipes
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

  const deleteMeal = async (mealId: string) => {
    await supabase.from('meal_plans').delete().eq('id', mealId);
    queryClient.invalidateQueries({ queryKey: ['meal_plans', weekStart] });
  };

  const today = new Date();

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
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
        ) : meals.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
            <CalendarDays className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground mb-1">Aucun planning pour cette semaine</p>
            <p className="text-sm text-muted-foreground/70 mb-6">Demande à Chef de te préparer un planning</p>
            <Button onClick={() => navigate('/home')} variant="outline" className="gap-2">
              <Utensils className="h-4 w-4" />
              Planifier avec Chef
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {weekDays.map((day, dayIndex) => {
              const dayMeals = MEAL_TYPES.map(mt => ({ ...mt, meal: getMeal(dayIndex, mt.key) }));
              const hasMeals = dayMeals.some(dm => dm.meal);
              const isToday = isSameDay(day, today);

              return (
                <Card
                  key={dayIndex}
                  className={`p-3 ${isToday ? 'ring-2 ring-primary/30 bg-primary/5' : ''}`}
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

                  {!hasMeals ? (
                    <p className="text-xs text-muted-foreground/60 italic">Rien de prévu</p>
                  ) : (
                    <div className="space-y-1.5">
                      {dayMeals.map(({ key, label, icon, meal }) => {
                        if (!meal) return null;
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
                              onClick={() => deleteMeal(meal.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
