import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useRecipes } from './useRecipes';
import { useUserPreferences, UserCulinaryPreferences } from './useUserPreferences';
import { useChatEngine, ChatMode, ActiveRecipeData, PendingRecipe, ToolCallAction } from './useChatEngine';
import type { Recipe, Ingredient, Step } from '@/types/recipe';

// Re-export types
export type { ChatMessage, ChatMode, MessageContent } from './useChatEngine';

interface UseRecipeChatOptions {
  recipe: Recipe;
  completedSteps: Set<number>;
  onRecipeUpdate?: (data: PendingRecipe) => Promise<void>;
  onRecipeCreate?: (data: PendingRecipe) => Promise<void>;
}

export function useRecipeChat({ recipe, completedSteps, onRecipeUpdate, onRecipeCreate }: UseRecipeChatOptions) {
  const { data: recipes = [] } = useRecipes();
  const { preferences, updatePreferences } = useUserPreferences();

  const welcomeMessage = `Salut ! 👨‍🍳 Je suis prêt à t'accompagner pour \"**${recipe.title}**\".\n\nJe peux te guider en cuisine, modifier la recette ou répondre à tes questions. Que veux-tu faire ?`;

  const initialActiveRecipe: ActiveRecipeData = {
    id: recipe.id, title: recipe.title, servings: recipe.servings,
    season: recipe.season, ingredients: recipe.ingredients, steps: recipe.steps,
  };

  const activeRecipeRef = useRef(initialActiveRecipe);

  const handleToolCall = useCallback(async (action: ToolCallAction): Promise<any> => {
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

      case 'start_cooking': {
        engine.setMode('cooking');
        toast.success('Mode cuisine activé');
        return { modeSwitch: 'cooking', recipe: activeRecipeRef.current, initialContext: action.data.initial_context };
      }

      case 'start_editing': {
        engine.setMode('editing');
        toast.success('Mode modification activé');
        return { modeSwitch: 'editing', recipe: activeRecipeRef.current, initialContext: action.data.modification_request };
      }

      case 'start_recipe_creation': {
        engine.setMode('creating');
        toast.success('Mode création activé');
        return { modeSwitch: 'creating', initialContext: action.data.initial_idea };
      }

      case 'back_to_orchestration': {
        engine.setMode('cooking');
        toast.info('Retour au mode cuisine');
        return null;
      }

      case 'start_memory': {
        engine.setMode('memory');
        toast.success('Mode mémoire activé');
        return { modeSwitch: 'memory', initialContext: 'Affiche mes préférences actuelles' };
      }

      case 'get_preferences': return preferences;

      case 'update_preferences': {
        const operations = action.data.operations as Array<{
          operation: 'add' | 'remove' | 'set';
          category: 'taste_preferences' | 'kitchen_equipment' | 'culinary_style' | 'dietary_constraints';
          field: string; values?: string[]; value?: string | null;
        }>;
        if (!preferences) { toast.error('Impossible de charger les préférences'); return { error: 'No preferences loaded' }; }
        const updatedPrefs = JSON.parse(JSON.stringify(preferences)) as UserCulinaryPreferences;
        for (const op of operations) {
          const category = (updatedPrefs as any)[op.category];
          if (!category) continue;
          if (op.operation === 'add' && op.values) { const c = (category[op.field] as string[]) || []; category[op.field] = [...new Set([...c, ...op.values])]; }
          else if (op.operation === 'remove' && op.values) { const c = (category[op.field] as string[]) || []; category[op.field] = c.filter((v: string) => !op.values!.includes(v)); }
          else if (op.operation === 'set') { category[op.field] = op.value; }
        }
        try { await updatePreferences(updatedPrefs); toast.success('Préférences mises à jour !'); return { success: true, updatedPreferences: updatedPrefs }; }
        catch (error) { console.error('Error updating preferences:', error); toast.error('Erreur lors de la mise à jour'); return { error: 'Update failed' }; }
      }

      case 'save_recipe': { engine.setPendingRecipe(action.data as unknown as PendingRecipe); return null; }
      case 'extract_modified_recipe': {
        engine.setPendingRecipe({ ...(action.data as unknown as PendingRecipe), isUpdate: true, originalRecipeId: activeRecipeRef.current.id });
        return null;
      }
      case 'create_new_recipe': {
        engine.setPendingRecipe({ ...(action.data as unknown as PendingRecipe), relationToOriginal: action.data.relation_to_original as string });
        return null;
      }

      default: console.log('Unknown tool call:', action.type); return null;
    }
  }, [recipes, preferences, updatePreferences]);

  const buildRequest = useCallback(async ({ apiMessages, mode, activeRecipe }: any) => {
    const recipeSummaries = recipes.map(r => ({ id: r.id, title: r.title, status: r.status, is_favorite: r.is_favorite }));
    const activeWithSteps = activeRecipe ? { ...activeRecipe, completedSteps: Array.from(completedSteps) } : null;
    return {
      endpoint: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/home-assistant`,
      body: { messages: apiMessages, recipes: recipeSummaries, mode, activeRecipe: activeWithSteps },
    };
  }, [recipes, completedSteps]);

  const buildContinuationRequest = useCallback(async ({ newMode, recipe: r, initialContext }: any) => {
    const recipeSummaries = recipes.map(r => ({ id: r.id, title: r.title, status: r.status, is_favorite: r.is_favorite }));
    const activeWithSteps = r ? { ...r, completedSteps: Array.from(completedSteps) } : null;
    const endpoint = newMode === 'memory'
      ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/memory-assistant`
      : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/home-assistant`;
    const body = newMode === 'memory'
      ? { messages: [{ role: 'user', content: initialContext }], currentPreferences: preferences, isContinuation: true }
      : { messages: [{ role: 'user', content: initialContext }], recipes: recipeSummaries, mode: newMode, activeRecipe: activeWithSteps, isContinuation: true };
    return { endpoint, body };
  }, [recipes, preferences, completedSteps]);

  const engine = useChatEngine({
    welcomeMessage,
    initialMode: 'cooking',
    initialActiveRecipe,
    onToolCall: handleToolCall,
    buildRequest,
    buildContinuationRequest,
  });

  // Keep ref in sync
  if (engine.activeRecipe) activeRecipeRef.current = engine.activeRecipe;

  const savePendingRecipe = useCallback(async () => {
    const pending = engine.pendingRecipe;
    if (!pending) return;
    try {
      if (pending.isUpdate && onRecipeUpdate) await onRecipeUpdate(pending);
      else if (onRecipeCreate) await onRecipeCreate(pending);
      engine.setPendingRecipe(null);
      engine.setMessages(prev => [...prev, {
        id: `assistant-${Date.now()}`, role: 'assistant',
        content: pending.isUpdate ? `✅ Recette \"${pending.title}\" mise à jour !` : `✅ Nouvelle recette \"${pending.title}\" créée !`,
        timestamp: new Date(),
      }]);
    } catch (error) { console.error('Error saving recipe:', error); toast.error("Erreur lors de l'enregistrement"); }
  }, [engine.pendingRecipe, onRecipeUpdate, onRecipeCreate]);

  const cancelPendingRecipe = useCallback(() => {
    engine.setPendingRecipe(null);
    engine.setMessages(prev => [...prev, {
      id: `assistant-${Date.now()}`, role: 'assistant',
      content: "D'accord, on continue la discussion. Qu'est-ce que tu aimerais modifier ?",
      timestamp: new Date(),
    }]);
  }, []);

  return {
    messages: engine.messages, isStreaming: engine.isStreaming, mode: engine.mode,
    activeRecipe: engine.activeRecipe, pendingRecipe: engine.pendingRecipe,
    searchResults: engine.searchResults,
    sendMessage: engine.sendMessage, resetChat: engine.resetChat,
    savePendingRecipe, cancelPendingRecipe, getModeInfo: engine.getModeInfo,
    setMode: engine.setMode,
  };
}
