import { describe, it, expect } from 'vitest';
import { deriveStepTitle } from './step-title';
import type { Step } from '@/types/recipe';

const mk = (over: Partial<Step>): Step => ({ order: 1, text: '', ...over });

describe('deriveStepTitle', () => {
  it('utilise step.title quand il est présent', () => {
    expect(deriveStepTitle(mk({ title: 'Cuire les œufs', text: 'Faire cuire 6 min.' }), 0)).toBe('Cuire les œufs');
  });

  it('à défaut, dérive la première clause du texte', () => {
    expect(deriveStepTitle(mk({ text: 'Émincer les champignons, puis les poêler.' }), 0)).toBe('Émincer les champignons');
  });

  it('tronque une clause trop longue à ~40 caractères', () => {
    const long = 'Mélanger la farine le sucre les œufs le beurre et la levure ensemble';
    expect(deriveStepTitle(mk({ text: long }), 0).length).toBeLessThanOrEqual(41);
  });

  it('repli final « Étape N » si le texte est vide', () => {
    expect(deriveStepTitle(mk({ text: '' }), 2)).toBe('Étape 3');
  });
});
