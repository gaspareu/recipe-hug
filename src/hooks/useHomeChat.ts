import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { useRecipes } from './useRecipes';
import { useUserPreferences } from './useUserPreferences';
import { supabase } from '@/integrations/supabase/client';
import { useChatEngine, ActiveRecipeData, ChatEngineConfig, ToolCallAction, RecipeCard } from './useChatEngine';
import type { Ingredient } from '@/types/recipe';
import type { Json } from '@/integrations/supabase/types';
import { triggerRecipeCompletion } from '@/lib/recipe-completion';
import { generateRecipeImageInBackground } from '@/lib/recipe-image';
import { applyPreferenceOperations } from '@/lib/preference-operations';
import { buildPendingRecipeFromToolCall, parsePreferenceOperations } from '@/lib/chat-tool-payloads';

// Re-export types
export type { ChatMessage, MessageContent, PendingRecipe, ActiveRecipeData, RecipeCard } from './useChatEngine';

const WELCOME_MESSAGE = "Salut ! Je suis Chef, ton assistant culinaire. 👨‍🍳\n\nJe peux t'aider à :\n- 🔍 **Chercher** une recette dans ton livre\n- ✨ **Créer** une nouvelle recette\n- 👨‍🍳 **Cuisiner** en te guidant étape par étape\n- 🔧 **Modifier** une recette existante\n\nQu'est-ce qui te ferait plaisir ?";

export function useHomeChat() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: recipes = [], refetch: refetchRecipes } = useRecipes();
  const { preferences, updatePreferencesAsync } = useUserPreferences();

  // Mode cuisine : recette en cours de préparation en plein écran (null = fermé).
  const [cookingRecipeId, setCookingRecipeId] = useState<string | null>(null);

  // La recette active est fournie par le moteur en 2e argument (il en tient un
  // ref synchronisé, y compris pendant l'auto-retry) : plus besoin d'un ref
  // local dupliqué ici. C'était la cause du doublon de recette (regression #5).
  const handleToolCall = useCallback(async (action: ToolCallAction, activeRecipe: ActiveRecipeData | null): Promise<unknown> => {
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
        const summaries = results.map(r => ({ id: r.id, title: r.title, status: r.status, is_favorite: r.is_favorite ?? false }));
        const cards: RecipeCard[] = results.map(r => ({
          status: 'saved', id: r.id, title: r.title,
          servings: r.servings ?? 2, ingredients: r.ingredients,
          stepsCount: r.steps.length, isUpdate: false,
        }));
        return { summaries, cards };
      }

      case 'get_recipe_details': {
        const recipeId = action.data.recipe_id as string;
        const recipe = recipes.find(r => r.id === recipeId);
        if (!recipe) return null;
        const details: ActiveRecipeData = {
          id: recipe.id, title: recipe.title, servings: recipe.servings,
          season: recipe.season, ingredients: recipe.ingredients, steps: recipe.steps,
        };
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
        const operations = parsePreferenceOperations(action.data.operations);
        if (!operations) return { error: 'Invalid preference operations' };
        if (!preferences) { console.error('Impossible de charger les préférences'); return { error: 'No preferences loaded' }; }
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

  const [isSavingRecipe, setIsSavingRecipe] = useState(false);
  // Ref synchrone pour la garde anti double-clic (isSavingRecipe est asynchrone :
  // le state React n'est pas encore mis à jour au deuxième appel synchrone).
  const isSavingRef = useRef(false);

  const createProposedRecipe = useCallback(async (
    messageId: string,
    override: { servings: number; ingredients: Ingredient[] },
  ) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    const pending = engine.getProposedPending(messageId);
    if (!pending) { isSavingRef.current = false; return; }
    setIsSavingRecipe(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Tu dois être connecté pour enregistrer une recette.');
      const toSave = { ...pending, servings: override.servings, ingredients: override.ingredients };

      let recipeId = toSave.originalRecipeId ?? '';
      // Limitation connue (héritée de savePendingRecipe) : un update qui ne
      // touche aucune ligne (id inexistant, RLS) ne renvoie pas d'erreur —
      // la carte passerait en saved sans écriture réelle.
      if (toSave.isUpdate && toSave.originalRecipeId) {
        const { error } = await supabase.from('recipes').update({
          title: toSave.title, servings: toSave.servings,
          ingredients: toSave.ingredients as unknown as Json, steps: toSave.steps as unknown as Json,
          updated_at: new Date().toISOString(),
        }).eq('id', toSave.originalRecipeId);
        if (error) throw error;
      } else {
        const { data: newRecipe, error } = await supabase.from('recipes').insert({
          user_id: session.user.id, title: toSave.title, servings: toSave.servings,
          ingredients: toSave.ingredients as unknown as Json, steps: toSave.steps as unknown as Json,
          source_type: 'ai', status: 'draft',
        }).select('id').single();
        if (error) throw error;
        recipeId = newRecipe?.id ?? '';
        if (recipeId) {
          generateRecipeImageInBackground({
            recipeId, title: toSave.title, ingredients: toSave.ingredients,
            accessToken: session.access_token, onSuccess: refetchRecipes,
          });
          triggerRecipeCompletion(
            recipeId,
            { title: toSave.title, ingredients: toSave.ingredients, steps: toSave.steps,
              ai_summary: null, calorie_score: null, nutrition_tags: null, season: null },
            refetchRecipes,
          );
        }
      }

      await refetchRecipes();
      if (recipeId) queryClient.invalidateQueries({ queryKey: ['recipe', recipeId] });
      engine.updateMessageCard(messageId, {
        status: 'saved', id: recipeId,
        servings: toSave.servings, ingredients: toSave.ingredients,
      });
      engine.clearProposedPending(messageId);
      // Parité avec l'ancien savePendingRecipe : la recette active sort du
      // contexte une fois enregistrée (sinon les tours suivants la traînent).
      engine.setActiveRecipe(null);
    } catch (error) {
      console.error('Error saving recipe:', error);
      engine.setMessages(prev => [...prev, {
        id: `error-${Date.now()}`, role: 'assistant',
        content: "⚠️ Je n'ai pas pu enregistrer la recette. Vérifie ta connexion et réessaie.",
        timestamp: new Date(),
      }]);
    } finally {
      isSavingRef.current = false;
      setIsSavingRecipe(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `engine.*` sont stables ; la garde anti double-clic lit isSavingRef (ref), pas le state
  }, [refetchRecipes, queryClient]);

  const startCooking = useCallback((recipeId: string) => setCookingRecipeId(recipeId), []);
  const stopCooking = useCallback(() => setCookingRecipeId(null), []);

  return {
    messages: engine.messages, isStreaming: engine.isStreaming,
    activeRecipe: engine.activeRecipe,
    searchResults: engine.searchResults,
    sendMessage: engine.sendMessage, resetChat: engine.resetChat,
    regenerateResponse: engine.regenerateResponse, stopGeneration: engine.stopGeneration,
    createProposedRecipe, isSavingRecipe,
    cookingRecipeId, startCooking, stopCooking,
  };
}
