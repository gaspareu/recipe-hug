import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/hooks/useChatEngine';

const welcome: ChatMessage = { id: 'welcome', role: 'assistant', content: 'Bonjour', timestamp: new Date() };
const noop = () => {};

export function useHomeChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([welcome]);
  const [isStreaming, setStreaming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancel = () => { clearTimeout(timer.current); setStreaming(false); };
  useEffect(() => () => clearTimeout(timer.current), []);

  const sendMessage = (content: string) => {
    if (isStreaming) return;
    setMessages(previous => [...previous, { id: `user-${Date.now()}`, role: 'user', content, timestamp: new Date() }]);
    setStreaming(true);
    timer.current = setTimeout(() => {
      setMessages(previous => [...previous, {
        id: `assistant-${Date.now()}`, role: 'assistant', timestamp: new Date(),
        content: `${/long/i.test(content) ? 'Voici un paragraphe de démonstration pour vérifier le défilement.\n\n'.repeat(30) : 'Voici une réponse de démonstration.'} [suggestions]["Préciser ma demande", "Une autre idée"][/suggestions]`,
      }]);
      // Simule [DONE] après le dernier contenu déjà rendu.
      timer.current = setTimeout(() => setStreaming(false), 500);
    }, 5000);
  };

  return {
    messages, isStreaming, sendMessage,
    resetChat: () => { cancel(); setMessages([welcome]); },
    stopGeneration: cancel,
    regenerateResponse: () => sendMessage('Une autre réponse'),
    createProposedRecipe: noop,
    cookingRecipeId: null, cookingServings: undefined,
    startCooking: noop, stopCooking: noop,
  };
}
