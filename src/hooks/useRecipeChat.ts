import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useRecipes } from './useRecipes';
import { useUserPreferences, UserCulinaryPreferences } from './useUserPreferences';
import { supabase } from '@/integrations/supabase/client';
import type { Recipe, Ingredient, Step } from '@/types/recipe';
import { ChatMessage, ChatMode, MessageContent } from './useHomeChat';

// Re-export types from useHomeChat
export type { ChatMessage, ChatMode, MessageContent };

interface ActiveRecipeData {
  id: string;
  title: string;
  servings?: number | null;
  season?: string | null;
  ingredients?: Ingredient[];
  steps?: Step[];
  completedSteps?: number[];
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

interface SearchResult {
  id: string;
  title: string;
  status: string;
  is_favorite: boolean;
}

interface ToolCallAction {
  type: string;
  data: Record<string, unknown>;
}

interface UseRecipeChatOptions {
  recipe: Recipe;
  completedSteps: Set<number>;
  onRecipeUpdate?: (data: PendingRecipe) => Promise<void>;
  onRecipeCreate?: (data: PendingRecipe) => Promise<void>;
}

export function useRecipeChat({ recipe, completedSteps, onRecipeUpdate, onRecipeCreate }: UseRecipeChatOptions) {
  const { data: recipes = [], refetch: refetchRecipes } = useRecipes();
  const { preferences, updatePreferences } = useUserPreferences();

  const welcomeMessage = `Salut ! 👨‍🍳 Je suis prêt à t'accompagner pour \"**${recipe.title}**\".\n\nJe peux te guider en cuisine, modifier la recette ou répondre à tes questions. Que veux-tu faire ?`;

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'assistant', content: welcomeMessage, timestamp: new Date() },
  ]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [mode, setMode] = useState<ChatMode>('cooking');
  const [activeRecipe, setActiveRecipe] = useState<ActiveRecipeData>({
    id: recipe.id,
    title: recipe.title,
    servings: recipe.servings,
    season: recipe.season,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
  });
  const [pendingRecipe, setPendingRecipe] = useState<PendingRecipe | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const pendingModeSwitchRef = useRef<{
    newMode: ChatMode;
    recipe: ActiveRecipeData | null;
    initialContext: string;
  } | null>(null);

  // Keep activeRecipe in sync with parent recipe
  const activeRecipeRef = useRef(activeRecipe);
  activeRecipeRef.current = activeRecipe;

  const handleToolCall = useCallback(async (action: ToolCallAction): Promise<any> => {
    console.log('Recipe chat tool call:', action.type, action.data);

    switch (action.type) {
      case 'search_recipes': {
        const query = (action.data.query as string || '').toLowerCase();
        const statusFilter = action.data.status_filter as string;
        const favoritesOnly = action.data.favorites_only as boolean;
        let results = recipes.filter(r => {
          const matchesQuery = !query || r.title.toLowerCase().includes(query) || r.ingredients.some(i => i.name.toLowerCase().includes(query));
          const matchesStatus = !statusFilter || statusFilter === 'all' || r.status === statusFilter;
          const matchesFavorite = !favoritesOnly || r.is_favorite;
          return matchesQuery && matchesStatus && matchesFavorite;
        }).slice(0, 10);
        const searchRes = results.map(r => ({ id: r.id, title: r.title, status: r.status, is_favorite: r.is_favorite ?? false }));
        setSearchResults(searchRes);
        return searchRes;
      }

      case 'start_cooking': {
        setMode('cooking');
        toast.success('Mode cuisine activé');
        return { modeSwitch: 'cooking', recipe: activeRecipeRef.current, initialContext: action.data.initial_context };
      }

      case 'start_editing': {
        setMode('editing');
        toast.success('Mode modification activé');
        return { modeSwitch: 'editing', recipe: activeRecipeRef.current, initialContext: action.data.modification_request };
      }

      case 'start_recipe_creation': {
        setMode('creating');
        toast.success('Mode création activé');
        return { modeSwitch: 'creating', initialContext: action.data.initial_idea };
      }

      case 'back_to_orchestration': {
        setMode('cooking');
        toast.info('Retour au mode cuisine');
        return null;
      }

      case 'start_memory': {
        setMode('memory');
        toast.success('Mode mémoire activé');
        return { modeSwitch: 'memory', initialContext: 'Affiche mes préférences actuelles' };
      }

      case 'get_preferences': {
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
        if (!preferences) { toast.error('Impossible de charger les préférences'); return { error: 'No preferences loaded' }; }
        const updatedPrefs = JSON.parse(JSON.stringify(preferences)) as UserCulinaryPreferences;
        for (const op of operations) {
          const category = (updatedPrefs as any)[op.category];
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
        setPendingRecipe({ ...recipeData, isUpdate: true, originalRecipeId: activeRecipeRef.current.id });
        return null;
      }

      case 'create_new_recipe': {
        const recipeData = action.data as unknown as PendingRecipe;
        setPendingRecipe({ ...recipeData, relationToOriginal: action.data.relation_to_original as string });
        return null;
      }

      default:
        console.log('Unknown tool call:', action.type);
        return null;
    }
  }, [recipes, preferences, updatePreferences]);

  // Continue conversation with new agent after mode switch
  const continueWithNewAgent = useCallback(async (
    newMode: ChatMode,
    recipeData: ActiveRecipeData | null,
    initialContext: string,
    previousAssistantMessageId: string,
  ) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const endpoint = newMode === 'memory'
        ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/memory-assistant`
        : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/home-assistant`;

      const recipeSummaries = recipes.map(r => ({ id: r.id, title: r.title, status: r.status, is_favorite: r.is_favorite }));

      const activeWithSteps = recipeData ? { ...recipeData, completedSteps: Array.from(completedSteps) } : null;

      const requestBody = newMode === 'memory'
        ? { messages: [{ role: 'user' as const, content: initialContext }], currentPreferences: preferences, isContinuation: true }
        : { messages: [{ role: 'user' as const, content: initialContext }], recipes: recipeSummaries, mode: newMode, activeRecipe: activeWithSteps, isContinuation: true };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok || !response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantContent = '';

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
              setMessages(prev => prev.map(m => m.id === previousAssistantMessageId ? { ...m, content: assistantContent } : m));
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
  }, [recipes, preferences, completedSteps]);

  // Send a message (with optional image)
  const sendMessage = useCallback(async (content: string, imageDataUrl?: string) => {
    if ((!content.trim() && !imageDataUrl) || isStreaming) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: content.trim() || (imageDataUrl ? '📷 Image envoyée' : ''),
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
      const apiMessages = [...messages.filter(m => m.id !== 'welcome'), userMessage].map(m => {
        if (m.imageUrl) {
          const parts: MessageContent = [];
          if (m.content && m.content !== '📷 Image envoyée') parts.push({ type: 'text', text: m.content });
          parts.push({ type: 'image_url', image_url: { url: m.imageUrl } });
          return { role: m.role, content: parts };
        }
        return { role: m.role, content: m.content };
      });

      const recipeSummaries = recipes.map(r => ({ id: r.id, title: r.title, status: r.status, is_favorite: r.is_favorite }));

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Vous devez être connecté');

      // Build activeRecipe with completedSteps
      const activeWithSteps: ActiveRecipeData = {
        ...activeRecipeRef.current,
        completedSteps: Array.from(completedSteps),
      };

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/home-assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ messages: apiMessages, recipes: recipeSummaries, mode, activeRecipe: activeWithSteps }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Erreur de communication avec l'assistant");
      }

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      setMessages(prev => [...prev, { id: assistantMessageId, role: 'assistant', content: '', timestamp: new Date() }]);

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
              setMessages(prev => prev.map(m => m.id === assistantMessageId ? { ...m, content: assistantContent } : m));
            }
            if (delta?.tool_calls) {
              for (const toolCall of delta.tool_calls) {
                if (toolCall.function?.name) toolCallName = toolCall.function.name;
                if (toolCall.function?.arguments) toolCallArguments += toolCall.function.arguments;
              }
            }
            const finishReason = parsed.choices?.[0]?.finish_reason;
            if (finishReason === 'tool_calls' && toolCallName && toolCallArguments) {
              try {
                const args = JSON.parse(toolCallArguments);
                const result = await handleToolCall({ type: toolCallName, data: args });
                if (toolCallName === 'search_recipes' && result) {
                  const searchResultsList = result as SearchResult[];
                  if (searchResultsList.length === 0) {
                    assistantContent += "\n\nJe n'ai trouvé aucune recette correspondante. Tu veux que je t'en crée une nouvelle ?";
                  } else {
                    assistantContent += '\n\n**Résultats trouvés :**\n';
                    searchResultsList.forEach((r, i) => {
                      const statusLabel = { draft: '📝', tested: '🧪', validated: '✅', archived: '📦' }[r.status] || r.status;
                      assistantContent += `${i + 1}. **${r.title}** - ${statusLabel}${r.is_favorite ? ' ⭐' : ''}\n`;
                    });
                  }
                  setMessages(prev => prev.map(m => m.id === assistantMessageId ? { ...m, content: assistantContent } : m));
                }
                if (result && typeof result === 'object' && 'modeSwitch' in result) {
                  const ms = result as { modeSwitch: ChatMode; recipe?: ActiveRecipeData; initialContext?: string };
                  pendingModeSwitchRef.current = { newMode: ms.modeSwitch, recipe: ms.recipe || null, initialContext: ms.initialContext || content };
                }
                toolCallName = '';
                toolCallArguments = '';
              } catch (e) {
                console.error('Failed to parse tool call:', e, toolCallArguments);
              }
            }
          } catch {
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }

      // Fallback: parse actions from text
      const actionRegex = /\{\s*\"action\"\s*:\s*\"([^\"]+)\"\s*,\s*\"parameters\"\s*:\s*(\{[^}]*\})\s*\}/g;
      let match;
      let contentToClean = assistantContent;
      while ((match = actionRegex.exec(assistantContent)) !== null) {
        const actionType = match[1];
        try {
          const parameters = JSON.parse(match[2]);
          const actionMap: Record<string, string> = {
            start_recipe_creation: 'start_recipe_creation', start_cooking: 'start_cooking', start_editing: 'start_editing',
            search_recipes: 'search_recipes', save_recipe: 'save_recipe', start_memory: 'start_memory',
          };
          const toolType = actionMap[actionType];
          if (toolType) {
            const result = await handleToolCall({ type: toolType, data: { ...parameters } });
            if (result && typeof result === 'object' && 'modeSwitch' in result) {
              const ms = result as { modeSwitch: ChatMode; recipe?: ActiveRecipeData; initialContext?: string };
              pendingModeSwitchRef.current = { newMode: ms.modeSwitch, recipe: ms.recipe || null, initialContext: ms.initialContext || content };
            }
          }
          contentToClean = contentToClean.replace(match[0], '').trim();
        } catch (e) { console.error('Failed to parse fallback action:', e); }
      }
      if (contentToClean !== assistantContent) {
        assistantContent = contentToClean;
        setMessages(prev => prev.map(m => m.id === assistantMessageId ? { ...m, content: assistantContent } : m));
      }

      if (pendingModeSwitchRef.current) {
        const { newMode, recipe: r, initialContext } = pendingModeSwitchRef.current;
        pendingModeSwitchRef.current = null;
        await new Promise(resolve => setTimeout(resolve, 500));
        await continueWithNewAgent(newMode, r, initialContext, assistantMessageId);
      }
    } catch (error) {
      console.error('Recipe chat error:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur de communication');
      setMessages(prev => prev.filter(m => m.id !== assistantMessageId));
      pendingModeSwitchRef.current = null;
    } finally {
      setIsStreaming(false);
    }
  }, [messages, isStreaming, recipes, mode, completedSteps, handleToolCall, continueWithNewAgent]);

  // Save pending recipe via parent callbacks
  const savePendingRecipe = useCallback(async () => {
    if (!pendingRecipe) return;
    try {
      if (pendingRecipe.isUpdate && onRecipeUpdate) {
        await onRecipeUpdate(pendingRecipe);
      } else if (onRecipeCreate) {
        await onRecipeCreate(pendingRecipe);
      }
      setPendingRecipe(null);
      setMessages(prev => [...prev, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: pendingRecipe.isUpdate
          ? `✅ Recette \"${pendingRecipe.title}\" mise à jour !`
          : `✅ Nouvelle recette \"${pendingRecipe.title}\" créée !`,
        timestamp: new Date(),
      }]);
    } catch (error) {
      console.error('Error saving recipe:', error);
      toast.error("Erreur lors de l'enregistrement");
    }
  }, [pendingRecipe, onRecipeUpdate, onRecipeCreate]);

  const cancelPendingRecipe = useCallback(() => {
    setPendingRecipe(null);
    setMessages(prev => [...prev, {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: "D'accord, on continue la discussion. Qu'est-ce que tu aimerais modifier ?",
      timestamp: new Date(),
    }]);
  }, []);

  const resetChat = useCallback(() => {
    setMessages([{ id: 'welcome', role: 'assistant', content: welcomeMessage, timestamp: new Date() }]);
    setMode('cooking');
    setPendingRecipe(null);
    setSearchResults([]);
  }, [welcomeMessage]);

  const getModeInfo = useCallback(() => {
    switch (mode) {
      case 'creating': return { label: 'Création', icon: '✨', color: 'bg-primary/10 text-primary' };
      case 'cooking': return { label: 'En cuisine', icon: '👨‍🍳', color: 'bg-green-500/10 text-green-600' };
      case 'editing': return { label: 'Modification', icon: '🔧', color: 'bg-orange-500/10 text-orange-600' };
      case 'memory': return { label: 'Mémoire', icon: '🧠', color: 'bg-purple-500/10 text-purple-600' };
      default: return null;
    }
  }, [mode]);

  return {
    messages, isStreaming, mode, activeRecipe, pendingRecipe, searchResults,
    sendMessage, resetChat, savePendingRecipe, cancelPendingRecipe, getModeInfo, setMode,
  };
}
