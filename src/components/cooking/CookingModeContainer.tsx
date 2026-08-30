import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRecipe, useUpdateRecipe, useCreateRecipe } from '@/hooks/useRecipes';
import { CookingMode } from './CookingMode';
import type { RecipeChatSession } from '@/hooks/useRecipeChat';
import type { PendingRecipe } from '@/hooks/useChatEngine';

interface CookingModeContainerProps {
  recipeId: string;
  onClose: () => void;
  initialServings?: number;
  chatSession?: RecipeChatSession;
  onStartCooking?: (recipeId: string, servings?: number) => void;
}

/**
 * Charge la recette ciblée puis rend le mode cuisine plein écran. Câble les
 * modifications/créations issues du chat Chef sur les mutations existantes.
 */
export function CookingModeContainer({ recipeId, onClose, initialServings, chatSession, onStartCooking }: CookingModeContainerProps) {
  const navigate = useNavigate();
  const { data: recipe, isLoading, refetch } = useRecipe(recipeId);
  const updateRecipe = useUpdateRecipe();
  const createRecipe = useCreateRecipe();

  const handleRecipeUpdate = useCallback(
    async (data: PendingRecipe) => {
      await updateRecipe.mutateAsync({ id: data.originalRecipeId ?? recipeId, title: data.title, servings: data.servings, ingredients: data.ingredients, steps: data.steps });
      await refetch();
    },
    [updateRecipe, recipeId, refetch],
  );

  const handleRecipeCreate = useCallback(
    async (data: PendingRecipe) => {
      const newRecipe = await createRecipe.mutateAsync({
        title: data.title, servings: data.servings, ingredients: data.ingredients, steps: data.steps,
        status: 'draft', is_favorite: false, source_type: 'ai',
        ai_summary: data.relationToOriginal ? `Inspiré de "${recipe?.title ?? ''}". ${data.relationToOriginal}` : null,
        season: null, nutrition_tags: null, calorie_score: null, source_image_url: null,
      });
      onClose();
      navigate(`/recipes/${newRecipe.id}`);
      return newRecipe.id;
    },
    [createRecipe, recipe?.title, onClose, navigate],
  );

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Chargement de la recette" />
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background p-8 text-center">
        <p className="text-muted-foreground">Recette introuvable</p>
        <Button onClick={onClose}>Fermer</Button>
      </div>
    );
  }

  return (
    <CookingMode
      key={`${recipe.id}:${initialServings ?? 'default'}`}
      recipe={recipe}
      onClose={onClose}
      initialServings={initialServings}
      chatSession={chatSession}
      onStartCooking={onStartCooking}
      onRecipeUpdate={handleRecipeUpdate}
      onRecipeCreate={handleRecipeCreate}
    />
  );
}
