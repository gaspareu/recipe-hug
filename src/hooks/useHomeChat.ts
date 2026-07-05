import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useRecipes } from './useRecipes';
import { useUserPreferences } from './useUserPreferences';
import { supabase } from '@/integrations/supabase/client';
import { useChatEngine, ActiveRecipeData, ChatEngineConfig, PendingRecipe, ToolCallAction } from './useChatEngine';
import type { Ingredient } from '@/types/recipe';
import type { Json } from '@/integrations/supabase/types';
import { triggerRecipeCompletion } from '@/lib/recipe-completion';
import { applyPreferenceOperations, type PreferenceOperation } from '@/lib/preference-operations';

// Re-export types
export type { ChatMessage, MessageContent, PendingRecipe, ActiveRecipeData, RecipeCard } from './useChatEngine';

const WELCOME_MESSAGE = "Salut ! Je suis Chef, ton assistant culinaire. 👨‍🍳\n\nJe peux t'aider à :\n- 🔍 **Chercher** une recette dans ton livre\n- ✨ **Créer** une nouvelle recette\n- 👨‍🍳 **Cuisiner** en te guidant étape par étape\n- 🔧 **Modifier** une recette existante\n\nQu'est-ce qui te ferait plaisir ?";

// Background image generation function (fire and forget)
async function triggerBackgroundImageGeneration(
  recipeId: string, title: string, ingredients: Ingredient[],
  accessToken: string, refetchRecipes: () => Promise<unknown>,
) {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-recipe-image`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ recipeId, title, ingredients }) },
    );
    if (response.ok) { await refetchRecipes(); }
  } catch (error) { console.warn('Image generation error:', error); }
}

export function useHomeChat() {
  const navigate = useNavigate();
  const { data: recipes = [], refetch: refetchRecipes } = useRecipes();
  const { preferences, updatePreferencesAsync } = useUserPreferences();

  // Mode cuisine : recette en cours de préparation en plein écran (null = fermé).
  const [cookingRecipeId, setCookingRecipeId] = useState<string | null>(null);

  // Recette active courante. handleToolCall est mémoïsé sans `engine` en
  // dépendance (dépendance circulaire) : lire `engine.activeRecipe` par closure
  // renverrait la valeur périmée du premier rendu (null), et une modification
  // serait enregistrée comme nouvelle recette. Le ref est posé dès
  // `get_recipe_details` (seule source d'une recette active), de façon synchrone
  // — avant l'auto-retry `extract_modified_recipe` qui survient dans le même tour.
  const activeRecipeRef = useRef<ActiveRecipeData | null>(null);

  const handleToolCall = useCallback(async (action: ToolCallAction): Promise<unknown> => {
    console.log('Tool call:', action.type, action.data);

    switch (action.type) {
      case 'search_recipes': {
        const rawQuery = (action.data.query as string || '').toLowerCase().trim();
        const query = rawQuery === 'all' ? '' : rawQuery;
        const statusFilter = action.data.status_filter as string;
        const favoritesOnly = action.data.favorites_only as boolean;
        const results = recipes.filter(r => {
          const matchesQuery = !query || r.title.toLowerCase().includes(query) || r.ingredients.some(i => i.name.toLowerCase().includes(query));
          const matchesStatus = !statusFilter || statusFilter === 'all' || r.status === statusFilter;
          const matchesFavorite = !favoritesOnly || r.is_favorite;
          return matchesQuery && matchesStatus && matchesFavorite;
        }).slice(0, 10);
        return results.map(r => ({ id: r.id, title: r.title, status: r.status, is_favorite: r.is_favorite ?? false }));
      }

      case 'get_recipe_details': {
        const recipeId = action.data.recipe_id as string;
        const recipe = recipes.find(r => r.id === recipeId);
        if (!recipe) return null;
        const details: ActiveRecipeData = {
          id: recipe.id, title: recipe.title, servings: recipe.servings,
          season: recipe.season, ingredients: recipe.ingredients, steps: recipe.steps,
        };
        // Synchronise le ref immédiatement : l'auto-retry (extract_modified_recipe)
        // survient dans le même tour, avant tout re-rendu.
        activeRecipeRef.current = details;
        return details;
      }

      case 'open_recipe': {
        const recipeId = action.data.recipe_id as string;
        if (recipeId) setTimeout(() => navigate(`/recipes/${recipeId}`), 500);
        return null;
      }

      case 'start_cooking': {
        const recipeId = action.data.recipe_id as string;
        if (recipeId) setCookingRecipeId(recipeId);
        return null;
      }

      case 'navigate': {
        const routes: Record<string, string> = { dashboard: '/dashboard', new_recipe: '/home', profile: '/profile', meal_planning: '/meal-planning' };
        const dest = action.data.destination as string;
        if (routes[dest]) setTimeout(() => navigate(routes[dest]), 500);
        return null;
      }

      case 'save_meal_plan': {
        const weekStart = action.data.week_start as string;
        const meals = action.data.meals as Array<{
          day_of_week: number; meal_type: string;
          recipe_id?: string; custom_meal?: string; notes?: string;
        }>;
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.user) return { error: 'Not authenticated' };
          
          // Delete existing meals for this week
          await supabase.from('meal_plans').delete()
            .eq('user_id', session.user.id)
            .eq('week_start', weekStart);
          
          // Insert new meals
          const rows = meals.map(m => ({
            user_id: session.user.id,
            week_start: weekStart,
            day_of_week: m.day_of_week,
            meal_type: m.meal_type,
            recipe_id: m.recipe_id || null,
            custom_meal: m.custom_meal || null,
            notes: m.notes || null,
          }));
          const { error } = await supabase.from('meal_plans').insert(rows);
          if (error) throw error;
          
          // Navigate to meal planning page
          setTimeout(() => navigate('/meal-planning'), 500);
          return { success: true };
        } catch (error) {
          console.error('Error saving meal plan:', error);
          return { error: 'Failed to save meal plan' };
        }
      }

      case 'get_preferences': return preferences;

      case 'update_preferences': {
        const operations = action.data.operations as PreferenceOperation[];
        if (!preferences) { console.error('Impossible de charger les préférences'); return { error: 'No preferences loaded' }; }
        const updatedPrefs = applyPreferenceOperations(preferences, operations);
        try { await updatePreferencesAsync(updatedPrefs); return { success: true, updatedPreferences: updatedPrefs }; }
        catch (error) { console.error('Error updating preferences:', error); return { error: 'Update failed' }; }
      }

      case 'save_recipe': { engine.setPendingRecipe(action.data as unknown as PendingRecipe); return null; }
      case 'extract_modified_recipe': {
        engine.setPendingRecipe({ ...(action.data as unknown as PendingRecipe), isUpdate: true, originalRecipeId: activeRecipeRef.current?.id });
        return null;
      }
      case 'create_new_recipe': {
        engine.setPendingRecipe({ ...(action.data as unknown as PendingRecipe), relationToOriginal: action.data.relation_to_original as string });
        return null;
      }

      default: console.log('Unknown tool call:', action.type); return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `engine` n'existe pas encore à la déclaration (dépendance circulaire avec useChatEngine) ; ses setters sont stables et `engine.activeRecipe` est lu via closure au moment de l'appel
  }, [recipes, navigate, preferences, updatePreferencesAsync]);

  const buildRequest = useCallback(async ({ apiMessages, activeRecipe }: Parameters<ChatEngineConfig['buildRequest']>[0]) => {
    const recipeSummaries = recipes.map(r => ({ id: r.id, title: r.title, status: r.status, is_favorite: r.is_favorite }));
    return {
      endpoint: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/home-assistant`,
      body: { messages: apiMessages, recipes: recipeSummaries, activeRecipe },
    };
  }, [recipes]);

  const engine = useChatEngine({
    welcomeMessage: WELCOME_MESSAGE,
    initialActiveRecipe: null,
    onToolCall: handleToolCall,
    buildRequest,
  });

  // Save pending recipe
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);
  const savePendingRecipe = useCallback(async () => {
    const pending = engine.pendingRecipe;
    if (!pending) return;
    setIsSavingRecipe(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Tu dois être connecté pour enregistrer une recette.');

      let recipeId = pending.originalRecipeId ?? '';

      if (pending.isUpdate && pending.originalRecipeId) {
        const { error } = await supabase.from('recipes').update({
          title: pending.title, servings: pending.servings,
          ingredients: pending.ingredients as unknown as Json, steps: pending.steps as unknown as Json,
          updated_at: new Date().toISOString(),
        }).eq('id', pending.originalRecipeId);
        if (error) throw error;
      } else {
        const { data: newRecipe, error } = await supabase.from('recipes').insert({
          user_id: session.user.id, title: pending.title, servings: pending.servings,
          ingredients: pending.ingredients as unknown as Json, steps: pending.steps as unknown as Json,
          source_type: 'ai', status: 'draft',
        }).select('id').single();
        if (error) throw error;
        recipeId = newRecipe?.id ?? '';
        if (recipeId) {
          triggerBackgroundImageGeneration(recipeId, pending.title, pending.ingredients, session.access_token, refetchRecipes);
          triggerRecipeCompletion(
            recipeId,
            {
              title: pending.title,
              ingredients: pending.ingredients,
              steps: pending.steps,
              ai_summary: null,
              calorie_score: null,
              nutrition_tags: null,
              season: null,
            },
            refetchRecipes,
          );
        }
      }

      await refetchRecipes();
      engine.setPendingRecipe(null);
      engine.setActiveRecipe(null);
      engine.setMessages(prev => [...prev, {
        id: `assistant-${Date.now()}`, role: 'assistant',
        content: pending.isUpdate
          ? `✅ J'ai mis à jour ta recette "${pending.title}" !`
          : `✅ J'ai enregistré ta nouvelle recette "${pending.title}" ! Une image est en cours de génération.`,
        timestamp: new Date(),
        recipeCard: recipeId ? { id: recipeId, title: pending.title, servings: pending.servings, isUpdate: !!pending.isUpdate } : undefined,
      }]);
    } catch (error) {
      console.error('Error saving recipe:', error);
      engine.setMessages(prev => [...prev, {
        id: `error-${Date.now()}`, role: 'assistant',
        content: "⚠️ Je n'ai pas pu enregistrer la recette. Vérifie ta connexion et réessaie.",
        timestamp: new Date(),
      }]);
    } finally {
      setIsSavingRecipe(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `engine.set*` sont des setters stables (useState), pas besoin de les lister
  }, [engine.pendingRecipe, refetchRecipes]);

  const cancelPendingRecipe = useCallback(() => {
    if (isSavingRecipe) return;
    engine.setPendingRecipe(null);
    engine.setMessages(prev => [...prev, {
      id: `assistant-${Date.now()}`, role: 'assistant',
      content: "D'accord, on continue la discussion. Qu'est-ce que tu aimerais modifier ?",
      timestamp: new Date(),
    }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `engine.set*` sont des setters stables (useState), pas besoin de les lister
  }, [isSavingRecipe]);

  const startCooking = useCallback((recipeId: string) => setCookingRecipeId(recipeId), []);
  const stopCooking = useCallback(() => setCookingRecipeId(null), []);

  return {
    messages: engine.messages, isStreaming: engine.isStreaming,
    activeRecipe: engine.activeRecipe, pendingRecipe: engine.pendingRecipe,
    searchResults: engine.searchResults,
    sendMessage: engine.sendMessage, resetChat: engine.resetChat,
    regenerateResponse: engine.regenerateResponse, stopGeneration: engine.stopGeneration,
    savePendingRecipe, cancelPendingRecipe, isSavingRecipe,
    cookingRecipeId, startCooking, stopCooking,
  };
}
