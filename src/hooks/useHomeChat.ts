import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useRecipes } from './useRecipes';
import { useUserPreferences, UserCulinaryPreferences } from './useUserPreferences';
import { supabase } from '@/integrations/supabase/client';
import type { Recipe, Ingredient, Step } from '@/types/recipe';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string; // For displaying image in UI
  timestamp: Date;
}

export type MessageContent = 
  | string 
  | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;

export type ChatMode = 'orchestration' | 'creating' | 'cooking' | 'editing' | 'memory';

interface ToolCallAction {
  type: string;
  data: Record<string, unknown>;
}

interface SearchResult {
  id: string;
  title: string;
  status: string;
  is_favorite: boolean;
}

interface ActiveRecipeData {
  id: string;
  title: string;
  servings?: number | null;
  season?: string | null;
  ingredients?: Ingredient[];
  steps?: Step[];
}

interface PendingRecipe {
  title: string;
  servings: number;
  ingredients: Ingredient[];
  steps: Step[];
  isUpdate?: boolean;
  originalRecipeId?: string;
  relationToOriginal?: string;
}

const WELCOME_MESSAGE = "Salut ! Je suis Chef, ton assistant culinaire. 👨‍🍳\n\nJe peux t'aider à :\n- 🔍 **Chercher** une recette dans ton livre\n- ✨ **Créer** une nouvelle recette\n- 👨‍🍳 **Cuisiner** en te guidant étape par étape\n- 🔧 **Modifier** une recette existante\n\nQu'est-ce qui te ferait plaisir ?";

export function useHomeChat() {
  const navigate = useNavigate();
  const { data: recipes = [], refetch: refetchRecipes } = useRecipes();
  const { preferences, updatePreferences, isLoading: prefsLoading } = useUserPreferences();

  // Core state
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: WELCOME_MESSAGE,
      timestamp: new Date(),
    }
  ]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [mode, setMode] = useState<ChatMode>('orchestration');
  const [activeRecipe, setActiveRecipe] = useState<ActiveRecipeData | null>(null);
  const [pendingRecipe, setPendingRecipe] = useState<PendingRecipe | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  // Refs for stable references
  const lastSearchResultsRef = useRef<SearchResult[]>([]);
  const pendingModeSwitchRef = useRef<{
    newMode: ChatMode;
    recipe: ActiveRecipeData | null;
    initialContext: string;
  } | null>(null);

  // Load a full recipe by ID
  const loadRecipe = useCallback(async (recipeId: string): Promise<ActiveRecipeData | null> => {
    const recipe = recipes.find(r => r.id === recipeId);
    if (recipe) {
      return {
        id: recipe.id,
        title: recipe.title,
        servings: recipe.servings,
        season: recipe.season,
        ingredients: recipe.ingredients,
        steps: recipe.steps,
      };
    }
    return null;
  }, [recipes]);

  // Handle tool calls from AI
  const handleToolCall = useCallback(async (action: ToolCallAction): Promise<any> => {
    console.log('Tool call:', action.type, action.data);

    switch (action.type) {
      case 'search_recipes': {
        const query = (action.data.query as string || '').toLowerCase();
        const statusFilter = action.data.status_filter as string;
        const favoritesOnly = action.data.favorites_only as boolean;

        let results = recipes.filter(r => {
          const matchesQuery = !query ||
            r.title.toLowerCase().includes(query) ||
            r.ingredients.some(i => i.name.toLowerCase().includes(query));
          const matchesStatus = !statusFilter || statusFilter === 'all' || r.status === statusFilter;
          const matchesFavorite = !favoritesOnly || r.is_favorite;
          return matchesQuery && matchesStatus && matchesFavorite;
        });

        results = results.slice(0, 10);
        const searchRes = results.map(r => ({
          id: r.id,
          title: r.title,
          status: r.status,
          is_favorite: r.is_favorite ?? false,
        }));
        setSearchResults(searchRes);
        lastSearchResultsRef.current = searchRes;

        return searchRes;
      }

      case 'start_cooking': {
        const recipeId = action.data.recipe_id as string;
        const recipe = await loadRecipe(recipeId);
        if (recipe) {
          setActiveRecipe(recipe);
          setMode('cooking');
          toast.success(`Mode cuisine activé pour "${recipe.title}"`);
          // Return mode switch info so we can continue the conversation
          return { modeSwitch: 'cooking', recipe, initialContext: action.data.initial_context };
        }
        return null;
      }

      case 'start_editing': {
        const recipeId = action.data.recipe_id as string;
        const modificationRequest = action.data.modification_request as string;
        const recipe = await loadRecipe(recipeId);
        if (recipe) {
          setActiveRecipe(recipe);
          setMode('editing');
          toast.success(`Mode modification activé pour "${recipe.title}"`);
          return { modeSwitch: 'editing', recipe, initialContext: modificationRequest };
        }
        return null;
      }

      case 'start_recipe_creation': {
        const initialIdea = action.data.initial_idea as string;
        setMode('creating');
        setActiveRecipe(null);
        toast.success('Mode création de recette activé');
        return { modeSwitch: 'creating', initialContext: initialIdea };
      }

      case 'open_recipe': {
        const recipeId = action.data.recipe_id as string;
        if (recipeId) {
          setTimeout(() => navigate(`/recipes/${recipeId}`), 500);
        }
        return null;
      }

      case 'navigate': {
        const destination = action.data.destination as string;
        const routes: Record<string, string> = {
          dashboard: '/dashboard',
          new_recipe: '/home',
          profile: '/profile',
        };
        if (routes[destination]) {
          setTimeout(() => navigate(routes[destination]), 500);
        }
        return null;
      }

      case 'back_to_orchestration': {
        setMode('orchestration');
        setActiveRecipe(null);
        setPendingRecipe(null);
        toast.info('Retour au mode principal');
        return null;
      }

      case 'start_memory': {
        setMode('memory');
        toast.success('Mode mémoire activé');
        return { modeSwitch: 'memory', initialContext: 'Affiche mes préférences actuelles' };
      }

      case 'get_preferences': {
        // Return preferences for display by the LLM
        return preferences;
      }

      case 'update_preferences': {
        const operations = action.data.operations as Array<{
          operation: 'add' | 'remove' | 'set';
          category: 'taste_preferences' | 'kitchen_equipment' | 'culinary_style' | 'dietary_constraints';
          field: string;
          values?: string[];
          value?: string | null;
        }>;

        if (!preferences) {
          toast.error('Impossible de charger les préférences');
          return { error: 'No preferences loaded' };
        }

        // Apply operations to create updated preferences
        const updatedPrefs = JSON.parse(JSON.stringify(preferences)) as UserCulinaryPreferences;

        for (const op of operations) {
          const categoryKey = op.category;
          // Use type assertion with any to handle dynamic property access
          const category = (updatedPrefs as any)[categoryKey];
          if (!category) continue;

          if (op.operation === 'add' && op.values) {
            const current = (category[op.field] as string[]) || [];
            category[op.field] = [...new Set([...current, ...op.values])];
          } else if (op.operation === 'remove' && op.values) {
            const current = (category[op.field] as string[]) || [];
            category[op.field] = current.filter((v: string) => !op.values!.includes(v));
          } else if (op.operation === 'set') {
            category[op.field] = op.value;
          }
        }

        try {
          await updatePreferences(updatedPrefs);
          toast.success('Préférences mises à jour !');
          return { success: true, updatedPreferences: updatedPrefs };
        } catch (error) {
          console.error('Error updating preferences:', error);
          toast.error('Erreur lors de la mise à jour');
          return { error: 'Update failed' };
        }
      }

      case 'save_recipe': {
        const recipeData = action.data as unknown as PendingRecipe;
        setPendingRecipe(recipeData);
        return null;
      }

      case 'extract_modified_recipe': {
        const recipeData = action.data as unknown as PendingRecipe;
        setPendingRecipe({
          ...recipeData,
          isUpdate: true,
          originalRecipeId: activeRecipe?.id,
        });
        return null;
      }

      case 'create_new_recipe': {
        const recipeData = action.data as unknown as PendingRecipe;
        setPendingRecipe({
          ...recipeData,
          relationToOriginal: action.data.relation_to_original as string,
        });
        return null;
      }

      default:
        console.log('Unknown tool call:', action.type);
        return null;
    }
  }, [recipes, loadRecipe, navigate, activeRecipe]);

  // Save the pending recipe
  const savePendingRecipe = useCallback(async () => {
    if (!pendingRecipe) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        toast.error('Vous devez être connecté');
        return;
      }

      if (pendingRecipe.isUpdate && pendingRecipe.originalRecipeId) {
        // Update existing recipe
        const { error } = await supabase
          .from('recipes')
          .update({
            title: pendingRecipe.title,
            servings: pendingRecipe.servings,
            ingredients: pendingRecipe.ingredients as any,
            steps: pendingRecipe.steps as any,
            updated_at: new Date().toISOString(),
          })
          .eq('id', pendingRecipe.originalRecipeId);

        if (error) throw error;
        toast.success('Recette mise à jour !');
      } else {
        // Create new recipe
        const { error } = await supabase
          .from('recipes')
          .insert({
            user_id: session.user.id,
            title: pendingRecipe.title,
            servings: pendingRecipe.servings,
            ingredients: pendingRecipe.ingredients as any,
            steps: pendingRecipe.steps as any,
            source_type: 'ai',
            status: 'draft',
          });

        if (error) throw error;
        toast.success('Recette créée !');
      }

      await refetchRecipes();
      setPendingRecipe(null);
      setMode('orchestration');
      setActiveRecipe(null);

      // Add confirmation message
      setMessages(prev => [...prev, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: pendingRecipe.isUpdate
          ? `✅ J'ai mis à jour ta recette "${pendingRecipe.title}" ! Tu veux faire autre chose ?`
          : `✅ J'ai enregistré ta nouvelle recette "${pendingRecipe.title}" ! Tu veux la cuisiner ou faire autre chose ?`,
        timestamp: new Date(),
      }]);

    } catch (error) {
      console.error('Error saving recipe:', error);
      toast.error('Erreur lors de l\'enregistrement');
    }
  }, [pendingRecipe, refetchRecipes]);

  // Cancel pending recipe
  const cancelPendingRecipe = useCallback(() => {
    setPendingRecipe(null);
    setMessages(prev => [...prev, {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: "D'accord, on continue la discussion. Qu'est-ce que tu aimerais modifier ?",
      timestamp: new Date(),
    }]);
  }, []);

  // Continue conversation with new agent after mode switch
  const continueWithNewAgent = useCallback(async (
    newMode: ChatMode,
    recipe: ActiveRecipeData | null,
    initialContext: string,
    previousAssistantMessageId: string
  ) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      // Build continuation message for the new agent
      const continuationMessage = {
        role: 'user' as const,
        content: initialContext,
      };

      // Choose endpoint based on mode
      const endpoint = newMode === 'memory' 
        ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/memory-assistant`
        : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/home-assistant`;

      const recipeSummaries = recipes.map(r => ({
        id: r.id,
        title: r.title,
        status: r.status,
        is_favorite: r.is_favorite,
      }));

      // Build request body based on mode
      const requestBody = newMode === 'memory'
        ? {
            messages: [continuationMessage],
            currentPreferences: preferences,
            isContinuation: true,
          }
        : {
            messages: [continuationMessage],
            recipes: recipeSummaries,
            mode: newMode,
            activeRecipe: recipe,
            isContinuation: true,
          };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok || !response.body) {
        if (response.status === 429) {
          toast.error('Trop de requêtes, réessaie dans un moment');
          return;
        }
        throw new Error('Erreur lors de la continuation');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantContent = '';

      // Update the previous assistant message with the new content
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta;

            if (delta?.content) {
              assistantContent += delta.content;
              setMessages(prev => prev.map(m =>
                m.id === previousAssistantMessageId
                  ? { ...m, content: assistantContent }
                  : m
              ));
            }
          } catch {
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }
    } catch (error) {
      console.error('Error continuing with new agent:', error);
    }
  }, [recipes, preferences]);

  // Send a message (with optional image)
  const sendMessage = useCallback(async (content: string, imageDataUrl?: string) => {
    if ((!content.trim() && !imageDataUrl) || isStreaming) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: content.trim() || (imageDataUrl ? "📷 Image envoyée" : ""),
      imageUrl: imageDataUrl,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsStreaming(true);
    setSearchResults([]);

    const assistantMessageId = `assistant-${Date.now()}`;
    let assistantContent = '';
    let toolCallName = '';
    let toolCallArguments = '';

    try {
      // Prepare messages for API (exclude welcome message)
      const apiMessages = [...messages.filter(m => m.id !== 'welcome'), userMessage].map(m => {
        // If message has an image, format as multimodal content
        if (m.imageUrl) {
          const parts: MessageContent = [];
          if (m.content && m.content !== "📷 Image envoyée") {
            parts.push({ type: 'text', text: m.content });
          }
          parts.push({ type: 'image_url', image_url: { url: m.imageUrl } });
          return { role: m.role, content: parts };
        }
        return { role: m.role, content: m.content };
      });

      // Include recipe summaries for orchestration context
      const recipeSummaries = recipes.map(r => ({
        id: r.id,
        title: r.title,
        status: r.status,
        is_favorite: r.is_favorite,
      }));

      // Get user session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Vous devez être connecté');
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/home-assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          messages: apiMessages,
          recipes: recipeSummaries,
          mode,
          activeRecipe,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erreur de communication avec l\'assistant');
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Add empty assistant message
      setMessages(prev => [...prev, {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta;

            if (delta?.content) {
              assistantContent += delta.content;
              setMessages(prev => prev.map(m =>
                m.id === assistantMessageId
                  ? { ...m, content: assistantContent }
                  : m
              ));
            }

            // Handle tool calls
            if (delta?.tool_calls) {
              for (const toolCall of delta.tool_calls) {
                if (toolCall.function?.name) {
                  toolCallName = toolCall.function.name;
                }
                if (toolCall.function?.arguments) {
                  toolCallArguments += toolCall.function.arguments;
                }
              }
            }

            // Check for finish with tool_calls
            const finishReason = parsed.choices?.[0]?.finish_reason;
            if (finishReason === 'tool_calls' && toolCallName && toolCallArguments) {
              try {
                const args = JSON.parse(toolCallArguments);
                const result = await handleToolCall({
                  type: toolCallName,
                  data: args,
                });

                // Handle search results in the message
                if (toolCallName === 'search_recipes' && result) {
                  const searchResultsList = result as SearchResult[];
                  if (searchResultsList.length === 0) {
                    assistantContent += "\n\nJe n'ai trouvé aucune recette correspondante dans ton livre. Tu veux que je t'en crée une nouvelle ?";
                  } else {
                    assistantContent += "\n\n**Résultats trouvés :**\n";
                    searchResultsList.forEach((r, i) => {
                      const statusLabel = {
                        draft: '📝 brouillon',
                        tested: '🧪 testée',
                        validated: '✅ validée',
                        archived: '📦 archivée',
                      }[r.status] || r.status;
                      assistantContent += `${i + 1}. **${r.title}** - ${statusLabel}${r.is_favorite ? ' ⭐' : ''}\n`;
                    });
                    assistantContent += "\nDis-moi laquelle tu veux ouvrir, cuisiner ou modifier !";
                  }
                  setMessages(prev => prev.map(m =>
                    m.id === assistantMessageId
                      ? { ...m, content: assistantContent }
                      : m
                  ));
                }

                // Handle mode switch - continue conversation with new agent
                if (result && typeof result === 'object' && 'modeSwitch' in result) {
                  const modeSwitchResult = result as { modeSwitch: ChatMode; recipe?: ActiveRecipeData; initialContext?: string };
                  
                  // Store the mode switch info to trigger a follow-up call after streaming ends
                  pendingModeSwitchRef.current = {
                    newMode: modeSwitchResult.modeSwitch,
                    recipe: modeSwitchResult.recipe || null,
                    initialContext: modeSwitchResult.initialContext || content,
                  };
                }

                // Reset tool call tracking for potential multiple calls
                toolCallName = '';
                toolCallArguments = '';
              } catch (e) {
                console.error('Failed to parse tool call:', e, toolCallArguments);
              }
            }
          } catch {
            // Incomplete JSON, wait for more data
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }

      // After streaming ends, check if we need to continue with new agent
      if (pendingModeSwitchRef.current) {
        const { newMode, recipe, initialContext } = pendingModeSwitchRef.current;
        pendingModeSwitchRef.current = null;
        
        // Small delay to avoid rate limiting between consecutive API calls
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Continue conversation with the new agent
        await continueWithNewAgent(newMode, recipe, initialContext, assistantMessageId);
      }
    } catch (error) {
      console.error('Home chat error:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur de communication');

      // Remove the empty assistant message on error
      setMessages(prev => prev.filter(m => m.id !== assistantMessageId));
      pendingModeSwitchRef.current = null;
    } finally {
      setIsStreaming(false);
    }
  }, [messages, isStreaming, recipes, mode, activeRecipe, handleToolCall]);

  // Reset chat to initial state
  const resetChat = useCallback(() => {
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: WELCOME_MESSAGE,
      timestamp: new Date(),
    }]);
    setMode('orchestration');
    setActiveRecipe(null);
    setPendingRecipe(null);
    setSearchResults([]);
  }, []);

  // Get mode display info
  const getModeInfo = useCallback(() => {
    switch (mode) {
      case 'creating':
        return { label: 'Création', icon: '✨', color: 'bg-primary/10 text-primary' };
      case 'cooking':
        return { label: 'En cuisine', icon: '👨‍🍳', color: 'bg-green-500/10 text-green-600' };
      case 'editing':
        return { label: 'Modification', icon: '🔧', color: 'bg-orange-500/10 text-orange-600' };
      case 'memory':
        return { label: 'Mémoire', icon: '🧠', color: 'bg-purple-500/10 text-purple-600' };
      default:
        return null;
    }
  }, [mode]);

  return {
    // State
    messages,
    isStreaming,
    mode,
    activeRecipe,
    pendingRecipe,
    searchResults,
    // Actions
    sendMessage,
    resetChat,
    savePendingRecipe,
    cancelPendingRecipe,
    // Helpers
    getModeInfo,
  };
}
