import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useRecipes } from './useRecipes';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ToolCallAction {
  type: 'search_recipes' | 'open_recipe' | 'navigate' | 'create_recipe_with_ai';
  data: Record<string, unknown>;
}

interface SearchResult {
  id: string;
  title: string;
  status: string;
  is_favorite: boolean;
}

export function useHomeChat() {
  const navigate = useNavigate();
  const { data: recipes = [] } = useRecipes();
  
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Salut ! Je suis Chef Michel, ton assistant culinaire. 👨‍🍳\n\nJe peux t'aider à :\n- 🔍 **Chercher** une recette dans ton livre\n- ✨ **Créer** une nouvelle recette avec l'IA\n- 📖 **Naviguer** dans l'application\n\nQu'est-ce qui te ferait plaisir ?",
      timestamp: new Date(),
    }
  ]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const lastSearchResultsRef = useRef<SearchResult[]>([]);

  const handleToolCall = useCallback((action: ToolCallAction) => {
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
        
        results = results.slice(0, 10); // Limit to 10 results
        setSearchResults(results);
        lastSearchResultsRef.current = results;
        
        return results.map(r => ({
          id: r.id,
          title: r.title,
          status: r.status,
          is_favorite: r.is_favorite,
        }));
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
          new_recipe: '/recipes/new',
          profile: '/profile',
        };
        if (routes[destination]) {
          setTimeout(() => navigate(routes[destination]), 500);
        }
        return null;
      }
      
      case 'create_recipe_with_ai': {
        const prompt = action.data.prompt as string;
        // Navigate to new recipe page with prompt in state
        setTimeout(() => navigate('/recipes/new', { state: { aiPrompt: prompt, tab: 'ai' } }), 500);
        return null;
      }
      
      default:
        return null;
    }
  }, [recipes, navigate]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isStreaming) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: content.trim(),
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
      const apiMessages = [...messages.filter(m => m.id !== 'welcome'), userMessage].map(m => ({
        role: m.role,
        content: m.content,
      }));

      // Include recipe summaries for context
      const recipeSummaries = recipes.map(r => ({
        id: r.id,
        title: r.title,
        status: r.status,
        is_favorite: r.is_favorite,
      }));

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/home-assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: apiMessages, recipes: recipeSummaries }),
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
                const result = handleToolCall({
                  type: toolCallName as ToolCallAction['type'],
                  data: args,
                });

                // If it's a search, add results to the message
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
                    assistantContent += "\nDis-moi laquelle tu veux ouvrir !";
                  }
                  setMessages(prev => prev.map(m =>
                    m.id === assistantMessageId
                      ? { ...m, content: assistantContent }
                      : m
                  ));
                }
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
    } catch (error) {
      console.error('Home chat error:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur de communication');
      
      // Remove the empty assistant message on error
      setMessages(prev => prev.filter(m => m.id !== assistantMessageId));
    } finally {
      setIsStreaming(false);
    }
  }, [messages, isStreaming, recipes, handleToolCall]);

  const resetChat = useCallback(() => {
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: "Salut ! Je suis Chef Michel, ton assistant culinaire. 👨‍🍳\n\nJe peux t'aider à :\n- 🔍 **Chercher** une recette dans ton livre\n- ✨ **Créer** une nouvelle recette avec l'IA\n- 📖 **Naviguer** dans l'application\n\nQu'est-ce qui te ferait plaisir ?",
      timestamp: new Date(),
    }]);
    setSearchResults([]);
  }, []);

  return {
    messages,
    isStreaming,
    searchResults,
    sendMessage,
    resetChat,
  };
}
