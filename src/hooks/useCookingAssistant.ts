import { useState, useCallback, useRef } from 'react';
import type { Recipe, Ingredient, Step } from '@/types/recipe';
import { supabase } from '@/integrations/supabase/client';

export type AssistantMode = 'cooking' | 'editing';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  extractedRecipe?: ExtractedRecipeData | null;
}

export interface ExtractedRecipeData {
  title: string;
  servings: number;
  ingredients: Ingredient[];
  steps: Step[];
  isNewRecipe?: boolean;
  relationToOriginal?: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cooking-assistant`;

const createWelcomeMessage = (recipeTitle: string, mode: AssistantMode): ChatMessage => ({
  id: 'welcome',
  role: 'assistant',
  content: mode === 'cooking' 
    ? `Bonjour ! 👨‍🍳 Je suis là pour vous accompagner dans la réalisation de "**${recipeTitle}**". 

Posez-moi vos questions sur les ingrédients, les techniques, ou dites-moi simplement "C'est parti !" pour commencer !`
    : `Bonjour ! ✏️ Je suis là pour vous aider à **modifier** la recette "**${recipeTitle}**".

Dites-moi ce que vous souhaitez changer : version végétarienne, sans gluten, plus épicée, moins d'ingrédients... 

Une fois satisfait, dites "Applique les modifications" et je mettrai à jour votre recette !`,
  timestamp: new Date(),
});

export function useCookingAssistant(
  recipe: Recipe, 
  completedSteps: Set<number> = new Set(),
  initialMode: AssistantMode = 'cooking'
) {
  const [mode, setMode] = useState<AssistantMode>(initialMode);
  const [messages, setMessages] = useState<ChatMessage[]>([createWelcomeMessage(recipe.title, initialMode)]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [pendingRecipe, setPendingRecipe] = useState<ExtractedRecipeData | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const totalSteps = recipe.steps.length;

  const changeMode = useCallback((newMode: AssistantMode) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMode(newMode);
    setMessages([createWelcomeMessage(recipe.title, newMode)]);
    setCurrentStepIndex(0);
    setIsStreaming(false);
    setPendingRecipe(null);
  }, [recipe.title]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    // Track step progression in cooking mode
    if (mode === 'cooking') {
      const stepMatch = text.match(/étape\s*(\d+)/i);
      if (stepMatch) {
        const stepNum = parseInt(stepMatch[1], 10);
        if (stepNum > 0 && stepNum <= totalSteps) {
          setCurrentStepIndex(stepNum);
        }
      } else if (text.toLowerCase().includes("c'est parti") || text.toLowerCase().includes("commencer")) {
        setCurrentStepIndex(1);
      }
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setIsStreaming(true);

    const apiMessages = newMessages.filter(m => m.id !== 'welcome').map(m => ({
      role: m.role,
      content: m.content,
    }));

    // Build steps with completion status
    const stepsWithStatus = recipe.steps.map((step: any) => ({
      ...step,
      completed: completedSteps.has(step.order),
    }));

    const recipeContext = {
      title: recipe.title,
      servings: recipe.servings,
      season: recipe.season,
      ingredients: recipe.ingredients,
      steps: stepsWithStatus,
      completedStepsCount: completedSteps.size,
      totalSteps: recipe.steps.length,
    };

    try {
      abortControllerRef.current = new AbortController();
      
      // Get user session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Vous devez être connecté pour utiliser l\'assistant');
      }
      
      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ messages: apiMessages, recipeContext, mode }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Erreur de communication avec l\'IA');
      }

      if (!response.body) {
        throw new Error('Pas de réponse du serveur');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let buffer = '';
      let toolCallArgs = '';
      let toolCallName = '';
      let isToolCall = false;

      const assistantMessageId = crypto.randomUUID();
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, assistantMessage]);

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
          if (jsonStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta;

            // Check for tool calls
            if (delta?.tool_calls) {
              isToolCall = true;
              for (const toolCall of delta.tool_calls) {
                if (toolCall.function?.name) {
                  toolCallName = toolCall.function.name;
                }
                if (toolCall.function?.arguments) {
                  toolCallArgs += toolCall.function.arguments;
                }
              }
            }

            if (delta?.content) {
              assistantContent += delta.content;
              setMessages(prev => prev.map(m => 
                m.id === assistantMessageId 
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

      // Process tool call result
      if (isToolCall && toolCallArgs) {
        try {
          const parsedData = JSON.parse(toolCallArgs);
          const isNewRecipe = toolCallName === 'create_new_recipe';
          
          const extractedRecipe: ExtractedRecipeData = {
            title: parsedData.title,
            servings: parsedData.servings,
            ingredients: parsedData.ingredients,
            steps: parsedData.steps,
            isNewRecipe,
            relationToOriginal: parsedData.relation_to_original,
          };
          
          console.log('Extracted recipe from tool call:', toolCallName, extractedRecipe);
          
          // Store pending recipe
          setPendingRecipe(extractedRecipe);
          
          // Update message with extracted recipe info
          const confirmationMessage = assistantContent || (isNewRecipe
            ? `✅ J'ai préparé la nouvelle recette "${extractedRecipe.title}". Cliquez sur "Créer la nouvelle recette" pour l'ajouter à votre carnet.`
            : `✅ J'ai préparé la version modifiée de votre recette "${extractedRecipe.title}". Cliquez sur "Appliquer les modifications" pour mettre à jour votre recette.`);
          
          setMessages(prev => prev.map(m => 
            m.id === assistantMessageId 
              ? { ...m, content: confirmationMessage, extractedRecipe }
              : m
          ));
        } catch (e) {
          console.error('Failed to parse tool call arguments:', e, toolCallArgs);
        }
      }

    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Cooking assistant error:', error);
        const errorMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Désolé, une erreur est survenue. Veuillez réessayer.',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [messages, isStreaming, recipe, totalSteps, completedSteps, mode]);

  const resetChat = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages([createWelcomeMessage(recipe.title, mode)]);
    setCurrentStepIndex(0);
    setIsStreaming(false);
    setPendingRecipe(null);
  }, [recipe.title, mode]);

  const clearPendingRecipe = useCallback(() => {
    setPendingRecipe(null);
  }, []);

  return {
    messages,
    isStreaming,
    sendMessage,
    resetChat,
    currentStepIndex,
    totalSteps,
    mode,
    changeMode,
    pendingRecipe,
    clearPendingRecipe,
  };
}
