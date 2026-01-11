import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Ingredient, Step } from '@/types/recipe';
import type { Json } from '@/integrations/supabase/types';

export interface RecipeVersion {
  id: string;
  recipe_id: string;
  user_id: string;
  version_number: number;
  title: string;
  servings: number | null;
  ingredients: Ingredient[];
  steps: Step[];
  season: string | null;
  nutrition_tags: string[] | null;
  change_description: string | null;
  created_at: string;
}

export function useRecipeVersions(recipeId: string) {
  return useQuery({
    queryKey: ['recipe-versions', recipeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipe_versions')
        .select('*')
        .eq('recipe_id', recipeId)
        .order('version_number', { ascending: false });

      if (error) throw error;
      
      return (data || []).map(v => ({
        ...v,
        ingredients: v.ingredients as unknown as Ingredient[],
        steps: v.steps as unknown as Step[],
      })) as RecipeVersion[];
    },
    enabled: !!recipeId,
  });
}

export function useCreateVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      recipeId,
      userId,
      title,
      servings,
      ingredients,
      steps,
      season,
      nutrition_tags,
      changeDescription,
    }: {
      recipeId: string;
      userId: string;
      title: string;
      servings: number | null;
      ingredients: Ingredient[];
      steps: Step[];
      season: string | null;
      nutrition_tags: string[] | null;
      changeDescription?: string;
    }) => {
      // Get current max version number
      const { data: existingVersions } = await supabase
        .from('recipe_versions')
        .select('version_number')
        .eq('recipe_id', recipeId)
        .order('version_number', { ascending: false })
        .limit(1);

      const nextVersion = (existingVersions?.[0]?.version_number || 0) + 1;

      const { data, error } = await supabase
        .from('recipe_versions')
        .insert({
          recipe_id: recipeId,
          user_id: userId,
          version_number: nextVersion,
          title,
          servings,
          ingredients: ingredients as unknown as Json,
          steps: steps as unknown as Json,
          season,
          nutrition_tags,
          change_description: changeDescription,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['recipe-versions', variables.recipeId] });
    },
  });
}

export function useRestoreVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      version,
      recipeId,
    }: {
      version: RecipeVersion;
      recipeId: string;
    }) => {
      const { error } = await supabase
        .from('recipes')
        .update({
          title: version.title,
          servings: version.servings,
          ingredients: version.ingredients as unknown as Json,
          steps: version.steps as unknown as Json,
          season: version.season,
          nutrition_tags: version.nutrition_tags,
        })
        .eq('id', recipeId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['recipe', variables.recipeId] });
    },
  });
}
