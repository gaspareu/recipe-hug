import { describe, expect, it } from 'vitest';

import {
  prepareTextForSpeech,
  splitTextForSpeech,
  stripAssistantMetadata,
} from './assistant-content';

describe('stripAssistantMetadata', () => {
  it('retire les suggestions et les actions techniques, y compris avec des paramètres imbriqués', () => {
    const content = [
      'La recette est prête.',
      '{"action":"save_recipe","parameters":{"recipe":{"title":"Soupe","meta":{"source":"chat"}}}}',
      '[suggestions]["La cuisiner", "Voir la recette"][/suggestions]',
    ].join('\n');

    expect(stripAssistantMetadata(content)).toBe('La recette est prête.');
  });

  it('préserve un objet JSON qui ne correspond pas à une action interne', () => {
    const content = 'Utilise cet exemple : {"temperature": 180, "unit": "°C"}.';

    expect(stripAssistantMetadata(content)).toBe(content);
  });
});

describe('prepareTextForSpeech', () => {
  it('ne prononce ni les métadonnées assistant, ni la syntaxe Markdown', () => {
    const content = [
      'Bonjour **le monde** 👋',
      '{"action":"navigate","parameters":{"path":"/recipes/42"}}',
      '[suggestions]["Continuer"][/suggestions]',
    ].join('\n');

    expect(prepareTextForSpeech(content)).toBe('Bonjour le monde');
  });

  it('conserve le libellé des liens Markdown sans lire leur URL', () => {
    expect(prepareTextForSpeech('Ouvre [la recette](https://example.com/recipe).')).toBe(
      'Ouvre la recette.',
    );
  });
});

describe('splitTextForSpeech', () => {
  it('découpe une longue réponse sur des frontières naturelles', () => {
    const chunks = splitTextForSpeech(
      'Première phrase assez longue. Deuxième phrase également détaillée. Troisième phrase finale.',
      40,
    );

    expect(chunks).toEqual([
      'Première phrase assez longue.',
      'Deuxième phrase également détaillée.',
      'Troisième phrase finale.',
    ]);
    expect(chunks.every((chunk) => chunk.length <= 40)).toBe(true);
  });
});
