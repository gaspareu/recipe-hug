import { describe, it, expect } from 'vitest';
import { shouldSpeakMessage } from './shouldSpeakMessage';
import type { ChatMessage } from '@/hooks/useChatEngine';

function msg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Voici ta recette.',
    timestamp: new Date(),
    ...overrides,
  };
}

const enabled = { voiceEnabled: true, isStreaming: false, lastSpokenContent: '' };

describe('shouldSpeakMessage', () => {
  it('lit une vraie réponse de l\'assistant quand le vocal est actif', () => {
    expect(shouldSpeakMessage(msg(), enabled)).toBe(true);
  });

  it('ne lit jamais le message d\'accueil (id "welcome"), même à l\'activation du vocal', () => {
    const welcome = msg({ id: 'welcome', content: 'Salut ! Je suis Chef…' });
    expect(shouldSpeakMessage(welcome, enabled)).toBe(false);
  });

  it('ne lit rien tant que le mode vocal est désactivé', () => {
    expect(shouldSpeakMessage(msg(), { ...enabled, voiceEnabled: false })).toBe(false);
  });

  it('ne lit pas une réponse encore en streaming', () => {
    expect(shouldSpeakMessage(msg(), { ...enabled, isStreaming: true })).toBe(false);
  });

  it('ne lit pas les messages de l\'utilisateur', () => {
    expect(shouldSpeakMessage(msg({ role: 'user' }), enabled)).toBe(false);
  });

  it('ne lit pas un message vide', () => {
    expect(shouldSpeakMessage(msg({ content: '' }), enabled)).toBe(false);
  });

  it('ne relit pas deux fois de suite le même contenu', () => {
    expect(
      shouldSpeakMessage(msg({ content: 'Bonjour' }), { ...enabled, lastSpokenContent: 'Bonjour' }),
    ).toBe(false);
  });

  it('gère l\'absence de message (liste vide)', () => {
    expect(shouldSpeakMessage(undefined, enabled)).toBe(false);
  });
});
