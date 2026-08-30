import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useRecipes } from './useRecipes';
import { useUserPreferences } from './useUserPreferences';
import { useChatEngine, ActiveRecipeData, ChatEngineConfig, PendingRecipe, RecipeCard, ToolCallAction } from './useChatEngine';
import type { Recipe } from '@/types/recipe';
import { applyPreferenceOperations } from '@/lib/preference-operations';
import { buildPendingRecipeFromToolCall, parsePreferenceOperations } from '@/lib/chat-tool-payloads';

// Re-export types
export type { ChatMessage, MessageContent } from './useChatEngine';

interface UseRecipeChatOptions {
  recipe: Recipe;
  completedSteps: Set<number>;
  onRecipeUpdate?: (data: PendingRecipe) => Promise<void>;
  onRecipeCreate?: (data: PendingRecipe) => Promise<string>;
  onStartCooking?: (recipeId: string, servings?: number) => void;
}

export function useRecipeChat({ recipe, completedSteps, onRecipeUpdate, onRecipeCreate, onStartCooking }: UseRecipeChatOptions) {
  const navigate = useNavigate();
  const { data: recipes = [] } = useRecipes();
  const { preferences, updatePreferencesAsync } = useUserPreferences();
  const completedStepsKey = Array.from(completedSteps).sort((left, right) => left - right).join(',');
  const completedStepsSnapshot = useMemo(
    () => completedStepsKey ? completedStepsKey.split(',').map(Number) : [],
    [completedStepsKey],
  );

  const welcomeMessage = `Salut ! 👨‍🍳 Je suis prêt à t'accompagner pour "**${recipe.title}**".\n\nJe peux te guider en cuisine, modifier la recette ou répondre à tes questions. Que veux-tu faire ?`;

  const initialActiveRecipe = useMemo<ActiveRecipeData>(() => ({
    id: recipe.id, title: recipe.title, servings: recipe.servings,
    season: recipe.season, ingredients: recipe.ingredients, steps: recipe.steps,
    completedSteps: completedStepsSnapshot,
  }), [recipe.id, recipe.title, recipe.servings, recipe.season, recipe.ingredients, recipe.steps, completedStepsSnapshot]);

  const handleToolCall = useCallback(async (action: ToolCallAction, activeRecipe: ActiveRecipeData | null): Promise<unknown> => {
    console.log('Recipe chat tool call:', action.type, action.data);

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
        return {
          summaries: results.map(r => ({ id: r.id, title: r.title, status: r.status, is_favorite: r.is_favorite ?? false })),
          cards: results.map<RecipeCard>(r => ({
            status: 'saved', id: r.id, title: r.title,
            servings: r.servings ?? 2, ingredients: r.ingredients,
            stepsCount: r.steps.length, isUpdate: false,
          })),
        };
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

      case 'open_recipe': {
        const recipeId = action.data.recipe_id as string;
        const isKnownRecipe = recipeId === recipe.id || recipes.some(candidate => candidate.id === recipeId);
        if (isKnownRecipe) setTimeout(() => navigate(`/recipes/${recipeId}`), 500);
        return null;
      }

      case 'start_cooking': {
        const recipeId = action.data.recipe_id as string;
        const requestedServings = action.data.servings;
        const servings = typeof requestedServings === 'number' && requestedServings > 0
          ? requestedServings
          : undefined;
        const isKnownRecipe = recipeId === recipe.id || recipes.some(candidate => candidate.id === recipeId);
        if (isKnownRecipe) onStartCooking?.(recipeId, servings);
        return null;
      }

      case 'navigate': {
        const routes: Record<string, string> = {
          dashboard: '/dashboard',
          new_recipe: '/home',
          profile: '/profile',
          meal_planning: '/meal-planning',
        };
        const destination = action.data.destination as string;
        if (routes[destination]) setTimeout(() => navigate(routes[destination]), 500);
        return null;
      }

      case 'get_preferences': return preferences;

      case 'update_preferences': {
        const operations = parsePreferenceOperations(action.data.operations);
        if (!operations) return { error: 'Invalid preference operations' };
        if (!preferences) return { error: 'No preferences loaded' };
        const updatedPrefs = applyPreferenceOperations(preferences, operations);
        try { await updatePreferencesAsync(updatedPrefs); return { success: true, updatedPreferences: updatedPrefs }; }
        catch (error) { console.error('Error updating preferences:', error); return { error: 'Update failed' }; }
      }

      case 'propose_recipe':
      case 'save_recipe':
      case 'extract_modified_recipe':
      case 'create_new_recipe': {
        const pending = buildPendingRecipeFromToolCall(action, activeRecipe);
        if (!pending) return null;
        if (
          pending.isUpdate
          && pending.originalRecipeId
          && pending.originalRecipeId !== recipe.id
          && !recipes.some(candidate => candidate.id === pending.originalRecipeId)
        ) return null;
        const card: RecipeCard = {
          status: 'proposed',
          title: pending.title,
          servings: pending.servings ?? 2,
          ingredients: pending.ingredients,
          stepsCount: pending.steps.length,
          intro: pending.intro,
          introClosing: pending.introClosing,
          tip: pending.tip,
          isUpdate: !!pending.isUpdate,
        };
        return { card, pending };
      }

      default: console.log('Unknown tool call:', action.type); return null;
    }
  }, [recipes, recipe.id, navigate, onStartCooking, preferences, updatePreferencesAsync]);

  const buildRequest = useCallback(async ({ apiMessages, activeRecipe }: Parameters<ChatEngineConfig['buildRequest']>[0]) => {
    const recipeSummaries = recipes.map(r => ({ id: r.id, title: r.title, status: r.status, is_favorite: r.is_favorite }));
    return {
      endpoint: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/home-assistant`,
      body: { messages: apiMessages, recipes: recipeSummaries, activeRecipe },
    };
  }, [recipes]);

  const engine = useChatEngine({
    welcomeMessage,
    initialActiveRecipe,
    onToolCall: handleToolCall,
    buildRequest,
  });
  const {
    setActiveRecipe,
    getProposedPending,
    updateMessageCard,
    clearProposedPending,
    setMessages,
  } = engine;

  const syncContext = useCallback((nextRecipe: Recipe, nextCompletedSteps: Set<number>) => {
    setActiveRecipe({
      id: nextRecipe.id,
      title: nextRecipe.title,
      servings: nextRecipe.servings,
      season: nextRecipe.season,
      ingredients: nextRecipe.ingredients,
      steps: nextRecipe.steps,
      completedSteps: Array.from(nextCompletedSteps),
    });
  }, [setActiveRecipe]);

  // Le nombre de portions peut changer pendant que le chat reste monté. Le
  // moteur initialise son contexte une seule fois : on le resynchronise pour
  // que Chef reçoive toujours les quantités actuellement affichées.
  useEffect(() => {
    setActiveRecipe(initialActiveRecipe);
  }, [setActiveRecipe, initialActiveRecipe]);

  const [isSavingRecipe, setIsSavingRecipe] = useState(false);
  const isSavingRef = useRef(false);
  const createProposedRecipe = useCallback(async (
    messageId: string,
    override: { servings: number; ingredients: PendingRecipe['ingredients'] },
  ) => {
    if (isSavingRef.current) return;
    const pending = getProposedPending(messageId);
    if (!pending) return;
    isSavingRef.current = true;
    setIsSavingRecipe(true);
    try {
      const toSave = { ...pending, servings: override.servings, ingredients: override.ingredients };
      let recipeId = pending.originalRecipeId ?? '';
      if (pending.isUpdate) {
        if (!onRecipeUpdate) throw new Error('Mise à jour de recette indisponible');
        await onRecipeUpdate(toSave);
      } else {
        if (!onRecipeCreate) throw new Error('Création de recette indisponible');
        recipeId = await onRecipeCreate(toSave);
      }

      updateMessageCard(messageId, {
        status: 'saved', id: recipeId,
        servings: toSave.servings, ingredients: toSave.ingredients,
      });
      clearProposedPending(messageId);
    } catch (error) {
      console.error('Error saving recipe:', error);
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: "⚠️ Je n'ai pas pu enregistrer la recette. Vérifie ta connexion et réessaie.",
        timestamp: new Date(),
      }]);
    } finally {
      isSavingRef.current = false;
      setIsSavingRecipe(false);
    }
  }, [getProposedPending, onRecipeUpdate, onRecipeCreate, updateMessageCard, clearProposedPending, setMessages]);

  return {
    messages: engine.messages, isStreaming: engine.isStreaming, toolActivity: engine.toolActivity,
    activeRecipe: engine.activeRecipe,
    searchResults: engine.searchResults,
    sendMessage: engine.sendMessage, resetChat: engine.resetChat,
    regenerateResponse: engine.regenerateResponse, stopGeneration: engine.stopGeneration,
    syncContext, createProposedRecipe, isSavingRecipe,
  };
}

export type RecipeChatSession = ReturnType<typeof useRecipeChat>;
