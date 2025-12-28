import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Recipe, RecipeFormData, Ingredient, Step } from '@/types/recipe';
import type { Json } from '@/integrations/supabase/types';

// Helper pour parser les données Supabase vers notre type Recipe
function parseRecipe(data: any): Recipe {
  return {
    ...data,
    ingredients: (data.ingredients as Ingredient[]) || [],
    steps: (data.steps as Step[]) || [],
  };
}

export function useRecipes() {
  return useQuery({
    queryKey: ['recipes'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      return (data || []).map(parseRecipe);
    },
  });
}

export function useRecipe(id: string) {
  return useQuery({
    queryKey: ['recipe', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) return null;
      return parseRecipe(data);
    },
    enabled: !!id,
  });
}

export function useCreateRecipe() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (recipe: RecipeFormData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .from('recipes')
        .insert([{
          title: recipe.title,
          status: recipe.status,
          is_favorite: recipe.is_favorite,
          servings: recipe.servings,
          ingredients: recipe.ingredients as unknown as Json,
          steps: recipe.steps as unknown as Json,
          season: recipe.season,
          nutrition_tags: recipe.nutrition_tags,
          calorie_score: recipe.calorie_score,
          ai_summary: recipe.ai_summary,
          source_type: recipe.source_type,
          source_image_url: recipe.source_image_url,
          user_id: user.id,
        }])
        .select()
        .single();
      
      if (error) throw error;
      return parseRecipe(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
    },
  });
}

export function useUpdateRecipe() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...recipe }: Partial<Recipe> & { id: string }) => {
      const updateData: Record<string, unknown> = { ...recipe };
      if (recipe.ingredients) {
        updateData.ingredients = recipe.ingredients as unknown as Json;
      }
      if (recipe.steps) {
        updateData.steps = recipe.steps as unknown as Json;
      }
      
      const { data, error } = await supabase
        .from('recipes')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return parseRecipe(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      queryClient.invalidateQueries({ queryKey: ['recipe', data.id] });
    },
  });
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('recipes')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
    },
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, is_favorite }: { id: string; is_favorite: boolean }) => {
      const { error } = await supabase
        .from('recipes')
        .update({ is_favorite })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
    },
  });
}
