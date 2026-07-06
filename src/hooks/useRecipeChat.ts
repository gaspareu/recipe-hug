import { useCallback } from 'react';

import { useRecipes } from './useRecipes';
import { useUserPreferences } from './useUserPreferences';
import { useChatEngine, ActiveRecipeData, ChatEngineConfig, PendingRecipe, ToolCallAction } from './useChatEngine';
import type { Recipe } from '@/types/recipe';
import { applyPreferenceOperations, type PreferenceOperation } from '@/lib/preference-operations';

// Re-export types
export type { ChatMessage, MessageContent } from './useChatEngine';

interface UseRecipeChatOptions {
  recipe: Recipe;
  completedSteps: Set<number>;
  onRecipeUpdate?: (data: PendingRecipe) => Promise<void>;
  onRecipeCreate?: (data: PendingRecipe) => Promise<void>;
}

export function useRecipeChat({ recipe, completedSteps, onRecipeUpdate, onRecipeCreate }: UseRecipeChatOptions) {
  const { data: recipes = [] } = useRecipes();
  const { preferences, updatePreferencesAsync } = useUserPreferences();

  const welcomeMessage = `Salut ! 👨‍🍳 Je suis prêt à t'accompagner pour "**${recipe.title}**".\n\nJe peux te guider en cuisine, modifier la recette ou répondre à tes questions. Que veux-tu faire ?`;

  const initialActiveRecipe: ActiveRecipeData = {
    id: recipe.id, title: recipe.title, servings: recipe.servings,
    season: recipe.season, ingredients: recipe.ingredients, steps: recipe.steps,
  };

  const handleToolCall = useCallback(async (action: ToolCallAction, activeRecipe: ActiveRecipeData | null): Promise<unknown> => {
    console.log('Recipe chat tool call:', action.type, action.data);

    switch (action.type) {
      case 'search_recipes': {
        const rawQuery = (action.data.query as string || '').toLowerCase().trim();
        const query = rawQuery === 'all' ? '' : rawQuery;
        const statusFilter = action.data.status_filter as string;
        const favoritesOnly = action.data.favorites_only as boolean;
        return recipes.filter(r => {
          const matchesQuery = !query || r.title.toLowerCase().includes(query) || r.ingredients.some(i => i.name.toLowerCase().includes(query));
          const matchesStatus = !statusFilter || statusFilter === 'all' || r.status === statusFilter;
          const matchesFavorite = !favoritesOnly || r.is_favorite;
          return matchesQuery && matchesStatus && matchesFavorite;
        }).slice(0, 10).map(r => ({ id: r.id, title: r.title, status: r.status, is_favorite: r.is_favorite ?? false }));
      }

      case 'get_recipe_details': {
        const recipeId = action.data.recipe_id as string;
        const recipe = recipes.find(r => r.id === recipeId);
        if (!recipe) return null;
        return {
          id: recipe.id, title: recipe.title, servings: recipe.servings,
          season: recipe.season, ingredients: recipe.ingredients, steps: recipe.steps,
        };
      }

      case 'get_preferences': return preferences;

      case 'update_preferences': {
        const operations = action.data.operations as PreferenceOperation[];
        if (!preferences) return { error: 'No preferences loaded' };
        const updatedPrefs = applyPreferenceOperations(preferences, operations);
        try { await updatePreferencesAsync(updatedPrefs); return { success: true, updatedPreferences: updatedPrefs }; }
        catch (error) { console.error('Error updating preferences:', error); return { error: 'Update failed' }; }
      }

      case 'save_recipe': { engine.setPendingRecipe(action.data as unknown as PendingRecipe); return null; }
      case 'extract_modified_recipe': {
        engine.setPendingRecipe({ ...(action.data as unknown as PendingRecipe), isUpdate: true, originalRecipeId: activeRecipe?.id });
        return null;
      }
      case 'create_new_recipe': {
        engine.setPendingRecipe({ ...(action.data as unknown as PendingRecipe), relationToOriginal: action.data.relation_to_original as string });
        return null;
      }

      default: console.log('Unknown tool call:', action.type); return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `engine` n'existe pas encore à la déclaration (dépendance circulaire avec useChatEngine) ; ses setters sont stables. La recette active vient désormais du 2e argument.
  }, [recipes, preferences, updatePreferencesAsync]);

  const buildRequest = useCallback(async ({ apiMessages, activeRecipe }: Parameters<ChatEngineConfig['buildRequest']>[0]) => {
    const recipeSummaries = recipes.map(r => ({ id: r.id, title: r.title, status: r.status, is_favorite: r.is_favorite }));
    const activeWithSteps = activeRecipe ? { ...activeRecipe, completedSteps: Array.from(completedSteps) } : null;
    return {
      endpoint: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/home-assistant`,
      body: { messages: apiMessages, recipes: recipeSummaries, activeRecipe: activeWithSteps },
    };
  }, [recipes, completedSteps]);

  const engine = useChatEngine({
    welcomeMessage,
    initialActiveRecipe,
    onToolCall: handleToolCall,
    buildRequest,
  });

  const savePendingRecipe = useCallback(async () => {
    const pending = engine.pendingRecipe;
    if (!pending) return;
    try {
      if (pending.isUpdate && onRecipeUpdate) await onRecipeUpdate(pending);
      else if (onRecipeCreate) await onRecipeCreate(pending);
      engine.setPendingRecipe(null);
      engine.setMessages(prev => [...prev, {
        id: `assistant-${Date.now()}`, role: 'assistant',
        content: pending.isUpdate ? `✅ Recette "${pending.title}" mise à jour !` : `✅ Nouvelle recette "${pending.title}" créée !`,
        timestamp: new Date(),
      }]);
    } catch (error) { console.error('Error saving recipe:', error); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `engine.set*` sont des setters stables (useState), pas besoin de les lister
  }, [engine.pendingRecipe, onRecipeUpdate, onRecipeCreate]);

  const cancelPendingRecipe = useCallback(() => {
    engine.setPendingRecipe(null);
    engine.setMessages(prev => [...prev, {
      id: `assistant-${Date.now()}`, role: 'assistant',
      content: "D'accord, on continue la discussion. Qu'est-ce que tu aimerais modifier ?",
      timestamp: new Date(),
    }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `engine.set*` sont des setters stables (useState), pas besoin de les lister
  }, []);

  return {
    messages: engine.messages, isStreaming: engine.isStreaming,
    activeRecipe: engine.activeRecipe, pendingRecipe: engine.pendingRecipe,
    searchResults: engine.searchResults,
    sendMessage: engine.sendMessage, resetChat: engine.resetChat,
    regenerateResponse: engine.regenerateResponse, stopGeneration: engine.stopGeneration,
    savePendingRecipe, cancelPendingRecipe,
  };
}
