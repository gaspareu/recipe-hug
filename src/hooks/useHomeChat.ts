import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { useRecipes } from './useRecipes';
import { useUserPreferences, UserCulinaryPreferences } from './useUserPreferences';
import { supabase } from '@/integrations/supabase/client';
import { useChatEngine, ActiveRecipeData, PendingRecipe, ToolCallAction } from './useChatEngine';
import type { Ingredient } from '@/types/recipe';

// Re-export types
export type { ChatMessage, MessageContent, PendingRecipe, ActiveRecipeData } from './useChatEngine';

const WELCOME_MESSAGE = "Salut ! Je suis Chef, ton assistant culinaire. 👨‍🍳\n\nJe peux t'aider à :\n- 🔍 **Chercher** une recette dans ton livre\n- ✨ **Créer** une nouvelle recette\n- 👨‍🍳 **Cuisiner** en te guidant étape par étape\n- 🔧 **Modifier** une recette existante\n\nQu'est-ce qui te ferait plaisir ?";

// Background image generation function (fire and forget)
async function triggerBackgroundImageGeneration(
  recipeId: string, title: string, ingredients: Ingredient[],
  accessToken: string, refetchRecipes: () => Promise<any>,
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
  const { preferences, updatePreferences } = useUserPreferences();

  const handleToolCall = useCallback(async (action: ToolCallAction): Promise<any> => {
    console.log('Tool call:', action.type, action.data);

    switch (action.type) {
      case 'search_recipes': {
        const rawQuery = (action.data.query as string || '').toLowerCase().trim();
        const query = rawQuery === 'all' ? '' : rawQuery;
        const statusFilter = action.data.status_filter as string;
        const favoritesOnly = action.data.favorites_only as boolean;
        let results = recipes.filter(r => {
          const matchesQuery = !query || r.title.toLowerCase().includes(query) || r.ingredients.some(i => i.name.toLowerCase().includes(query));
          const matchesStatus = !statusFilter || statusFilter === 'all' || r.status === statusFilter;
          const matchesFavorite = !favoritesOnly || r.is_favorite;
          return matchesQuery && matchesStatus && matchesFavorite;
        }).slice(0, 10);
        return results.map(r => ({ id: r.id, title: r.title, status: r.status, is_favorite: r.is_favorite ?? false }));
      }

      case 'open_recipe': {
        const recipeId = action.data.recipe_id as string;
        if (recipeId) setTimeout(() => navigate(`/recipes/${recipeId}`), 500);
        return null;
      }

      case 'navigate': {
        const routes: Record<string, string> = { dashboard: '/dashboard', new_recipe: '/home', profile: '/profile' };
        const dest = action.data.destination as string;
        if (routes[dest]) setTimeout(() => navigate(routes[dest]), 500);
        return null;
      }

      case 'get_preferences': return preferences;

      case 'update_preferences': {
        const operations = action.data.operations as Array<{
          operation: 'add' | 'remove' | 'set';
          category: 'taste_preferences' | 'kitchen_equipment' | 'culinary_style' | 'dietary_constraints';
          field: string; values?: string[]; value?: string | null;
        }>;
        if (!preferences) { console.error('Impossible de charger les préférences'); return { error: 'No preferences loaded' }; }
        const updatedPrefs = JSON.parse(JSON.stringify(preferences)) as UserCulinaryPreferences;
        for (const op of operations) {
          const category = (updatedPrefs as any)[op.category];
          if (!category) continue;
          if (op.operation === 'add' && op.values) { const c = (category[op.field] as string[]) || []; category[op.field] = [...new Set([...c, ...op.values])]; }
          else if (op.operation === 'remove' && op.values) { const c = (category[op.field] as string[]) || []; category[op.field] = c.filter((v: string) => !op.values!.includes(v)); }
          else if (op.operation === 'set') { category[op.field] = op.value; }
        }
        try { await updatePreferences(updatedPrefs); return { success: true, updatedPreferences: updatedPrefs }; }
        catch (error) { console.error('Error updating preferences:', error); return { error: 'Update failed' }; }
      }

      case 'save_recipe': { engine.setPendingRecipe(action.data as unknown as PendingRecipe); return null; }
      case 'extract_modified_recipe': {
        engine.setPendingRecipe({ ...(action.data as unknown as PendingRecipe), isUpdate: true, originalRecipeId: engine.activeRecipe?.id });
        return null;
      }
      case 'create_new_recipe': {
        engine.setPendingRecipe({ ...(action.data as unknown as PendingRecipe), relationToOriginal: action.data.relation_to_original as string });
        return null;
      }

      default: console.log('Unknown tool call:', action.type); return null;
    }
  }, [recipes, navigate, preferences, updatePreferences]);

  const buildRequest = useCallback(async ({ apiMessages, activeRecipe }: any) => {
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
  const savePendingRecipe = useCallback(async () => {
    const pending = engine.pendingRecipe;
    if (!pending) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { console.error('Not authenticated'); return; }

      if (pending.isUpdate && pending.originalRecipeId) {
        const { error } = await supabase.from('recipes').update({
          title: pending.title, servings: pending.servings,
          ingredients: pending.ingredients as any, steps: pending.steps as any,
          updated_at: new Date().toISOString(),
        }).eq('id', pending.originalRecipeId);
        if (error) throw error;
      } else {
        const { data: newRecipe, error } = await supabase.from('recipes').insert({
          user_id: session.user.id, title: pending.title, servings: pending.servings,
          ingredients: pending.ingredients as any, steps: pending.steps as any,
          source_type: 'ai', status: 'draft',
        }).select('id').single();
        if (error) throw error;
        if (newRecipe?.id) {
          triggerBackgroundImageGeneration(newRecipe.id, pending.title, pending.ingredients, session.access_token, refetchRecipes);
        }
      }

      await refetchRecipes();
      engine.setPendingRecipe(null);
      engine.setActiveRecipe(null);
      engine.setMessages(prev => [...prev, {
        id: `assistant-${Date.now()}`, role: 'assistant',
        content: pending.isUpdate
          ? `✅ J'ai mis à jour ta recette "${pending.title}" ! Tu veux faire autre chose ?`
          : `✅ J'ai enregistré ta nouvelle recette "${pending.title}" ! Une image est en cours de génération. Tu veux la cuisiner ou faire autre chose ?`,
        timestamp: new Date(),
      }]);
    } catch (error) { console.error('Error saving recipe:', error); }
  }, [engine.pendingRecipe, refetchRecipes]);

  const cancelPendingRecipe = useCallback(() => {
    engine.setPendingRecipe(null);
    engine.setMessages(prev => [...prev, {
      id: `assistant-${Date.now()}`, role: 'assistant',
      content: "D'accord, on continue la discussion. Qu'est-ce que tu aimerais modifier ?",
      timestamp: new Date(),
    }]);
  }, []);

  return {
    messages: engine.messages, isStreaming: engine.isStreaming,
    activeRecipe: engine.activeRecipe, pendingRecipe: engine.pendingRecipe,
    searchResults: engine.searchResults,
    sendMessage: engine.sendMessage, resetChat: engine.resetChat,
    savePendingRecipe, cancelPendingRecipe,
  };
}
