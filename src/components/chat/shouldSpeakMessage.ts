import type { ChatMessage } from '@/hooks/useChatEngine';

interface SpeakContext {
  /** Le mode vocal est-il actif ? */
  voiceEnabled: boolean;
  /** Une réponse est-elle en cours de streaming (à ne pas lire tant qu'incomplète) ? */
  isStreaming: boolean;
  /** Contenu déjà lu au tour précédent (déduplication). */
  lastSpokenContent: string;
}

/**
 * Décide si un message doit être lu à voix haute par la synthèse vocale.
 *
 * Règles :
 * - le mode vocal doit être actif ;
 * - le message d'accueil (`id: 'welcome'`) est pré-affiché au montage et ne doit
 *   jamais être lu : l'activation du vocal ne doit pas déclencher un monologue ;
 * - seuls les messages de l'assistant, non vides et hors streaming sont lus ;
 * - un même contenu n'est pas relu deux fois de suite.
 */
export function shouldSpeakMessage(
  message: ChatMessage | undefined,
  { voiceEnabled, isStreaming, lastSpokenContent }: SpeakContext,
): boolean {
  if (!voiceEnabled || isStreaming) return false;
  if (!message || message.id === 'welcome') return false;
  if (message.role !== 'assistant' || !message.content) return false;
  return message.content !== lastSpokenContent;
}
