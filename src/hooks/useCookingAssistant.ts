import { useState, useCallback, useRef } from 'react';
import type { Recipe } from '@/types/recipe';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cooking-assistant`;

const createWelcomeMessage = (recipeTitle: string): ChatMessage => ({
  id: 'welcome',
  role: 'assistant',
  content: `Bonjour ! 👨‍🍳 Je suis là pour vous accompagner dans la réalisation de "**${recipeTitle}**". 

Posez-moi vos questions sur les ingrédients, les techniques, ou dites-moi simplement "C'est parti !" pour commencer !`,
  timestamp: new Date(),
});

export function useCookingAssistant(recipe: Recipe, completedSteps: Set<number> = new Set()) {
  const [messages, setMessages] = useState<ChatMessage[]>([createWelcomeMessage(recipe.title)]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const totalSteps = recipe.steps.length;

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    // Track step progression
    const stepMatch = text.match(/étape\s*(\d+)/i);
    if (stepMatch) {
      const stepNum = parseInt(stepMatch[1], 10);
      if (stepNum > 0 && stepNum <= totalSteps) {
        setCurrentStepIndex(stepNum);
      }
    } else if (text.toLowerCase().includes("c'est parti") || text.toLowerCase().includes("commencer")) {
      setCurrentStepIndex(1);
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
      
      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: apiMessages, recipeContext }),
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
  }, [messages, isStreaming, recipe, totalSteps, completedSteps]);

  const resetChat = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages([createWelcomeMessage(recipe.title)]);
    setCurrentStepIndex(0);
    setIsStreaming(false);
  }, [recipe.title]);

  return {
    messages,
    isStreaming,
    sendMessage,
    resetChat,
    currentStepIndex,
    totalSteps,
  };
}
