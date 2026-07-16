import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Ingredient } from '@/types/recipe';

export interface MealPlanEntry {
  id: string;
  day_of_week: number;
  meal_type: string;
  recipe_id: string | null;
  custom_meal: string | null;
  notes: string | null;
  recipe_title?: string;
}

export interface RecipeWithIngredients {
  id: string;
  title: string;
  ingredients: Ingredient[];
}

export interface MealPlansData {
  entries: MealPlanEntry[];
  recipesMap: Record<string, RecipeWithIngredients>;
}

/** Repas planifiés de la semaine + recettes liées (pour titres et liste de courses). */
export function useMealPlans(weekStart: string) {
  return useQuery({
    queryKey: ['meal_plans', weekStart],
    queryFn: async (): Promise<MealPlansData> => {
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

export interface NewMealPlanEntry {
  weekStart: string;
  dayIndex: number;
  mealType: string;
  recipeId: string | null;
  customMeal: string | null;
}

export function useAddMealPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entry: NewMealPlanEntry) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');

      const { error } = await supabase.from('meal_plans').insert([{
        user_id: user.id,
        week_start: entry.weekStart,
        day_of_week: entry.dayIndex,
        meal_type: entry.mealType,
        recipe_id: entry.recipeId,
        custom_meal: entry.customMeal,
        notes: null,
      }]);
      if (error) throw error;
    },
    onSuccess: (_, entry) => {
      queryClient.invalidateQueries({ queryKey: ['meal_plans', entry.weekStart] });
    },
  });
}

export function useDeleteMealPlan() {
  return useMutation({
    mutationFn: async (mealId: string) => {
      const { error } = await supabase.from('meal_plans').delete().eq('id', mealId);
      if (error) throw error;
    },
  });
}
