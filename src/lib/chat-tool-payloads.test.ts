import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseRecipePayload,
  parsePreferenceOperations,
  buildPendingRecipeFromToolCall,
} from './chat-tool-payloads';

// Les payloads viennent du LLM (via le stream d'outils) : données externes non
// fiables. On valide la STRUCTURE et on normalise les types : quantity est
// coercé en number (string → parseFloat) pour permettre le recalcul des
// portions sans branche dans les hooks consommateurs.

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseRecipePayload', () => {
  it('accepte un payload save_recipe (quantity string, category)', () => {
    const recipe = parseRecipePayload({
      title: 'Tarte Tatin',
      servings: 6,
      ingredients: [{ name: 'Pomme', quantity: '6', unit: 'pièce', category: 'Fruits' }],
      steps: [{ order: 1, text: 'Caraméliser' }],
    });
    expect(recipe).not.toBeNull();
    expect(recipe!.title).toBe('Tarte Tatin');
    expect(recipe!.ingredients).toHaveLength(1);
  });

  it('accepte un payload extract/create (quantity number, tableaux vides)', () => {
    const recipe = parseRecipePayload({
      title: 'Tarte revisitée',
      servings: 4,
      ingredients: [],
      steps: [],
    });
    expect(recipe).not.toBeNull();
    expect(recipe!.title).toBe('Tarte revisitée');
  });

  it('préserve les marqueurs de mise à jour (isUpdate / originalRecipeId)', () => {
    const recipe = parseRecipePayload({
      title: 'Tarte Tatin',
      servings: 6,
      ingredients: [],
      steps: [],
      isUpdate: true,
      originalRecipeId: 'r1',
    });
    expect(recipe).not.toBeNull();
    expect(recipe!.isUpdate).toBe(true);
    expect(recipe!.originalRecipeId).toBe('r1');
  });

  it('rejette un titre manquant → null', () => {
    expect(
      parseRecipePayload({ servings: 4, ingredients: [], steps: [] }),
    ).toBeNull();
  });

  it('rejette un titre vide → null', () => {
    expect(
      parseRecipePayload({ title: '', servings: 4, ingredients: [], steps: [] }),
    ).toBeNull();
  });

  it('rejette des ingredients non-tableau → null', () => {
    expect(
      parseRecipePayload({ title: 'X', servings: 4, ingredients: 'pomme', steps: [] }),
    ).toBeNull();
  });

  it('rejette un ingrédient sans nom → null', () => {
    expect(
      parseRecipePayload({
        title: 'X',
        servings: 4,
        ingredients: [{ quantity: 2, unit: 'pièce' }],
        steps: [],
      }),
    ).toBeNull();
  });

  it('rejette une étape sans texte → null', () => {
    expect(
      parseRecipePayload({
        title: 'X',
        servings: 4,
        ingredients: [],
        steps: [{ order: 1 }],
      }),
    ).toBeNull();
  });

  it('rejette un non-objet → null et journalise (pas d\'échec silencieux)', () => {
    expect(parseRecipePayload(null)).toBeNull();
    expect(parseRecipePayload('save it')).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});

describe('parsePreferenceOperations', () => {
  it('accepte des opérations valides (add/remove/set)', () => {
    const ops = parsePreferenceOperations([
      { operation: 'add', category: 'dietary_constraints', field: 'allergies', values: ['arachides'] },
      { operation: 'set', category: 'culinary_style', field: 'preferred_difficulty', value: 'facile' },
    ]);
    expect(ops).not.toBeNull();
    expect(ops).toHaveLength(2);
  });

  it('rejette une catégorie inconnue → null', () => {
    expect(
      parsePreferenceOperations([
        { operation: 'add', category: 'inventée', field: 'x', values: ['y'] },
      ]),
    ).toBeNull();
  });

  it('rejette une opération inconnue → null', () => {
    expect(
      parsePreferenceOperations([
        { operation: 'delete', category: 'taste_preferences', field: 'liked_flavors', values: ['x'] },
      ]),
    ).toBeNull();
  });

  it('rejette un non-tableau → null', () => {
    expect(parsePreferenceOperations({ operation: 'add' })).toBeNull();
  });

  it('rejette un champ manquant → null', () => {
    expect(
      parsePreferenceOperations([{ operation: 'add', category: 'taste_preferences', values: ['x'] }]),
    ).toBeNull();
  });
});

describe('buildPendingRecipeFromToolCall', () => {
  const validData = {
    title: 'Tarte Tatin',
    servings: 6,
    ingredients: [{ name: 'Pomme', quantity: '6' }],
    steps: [{ text: 'Caraméliser' }],
  };
  const activeRecipe = { id: 'recipe-42', title: 'Base', servings: 4 };

  it('save_recipe → recette telle quelle (sans marqueur de mise à jour)', () => {
    const pending = buildPendingRecipeFromToolCall(
      { type: 'save_recipe', data: validData },
      null,
    );
    expect(pending).not.toBeNull();
    expect(pending!.title).toBe('Tarte Tatin');
    expect(pending!.isUpdate).toBeUndefined();
    expect(pending!.relationToOriginal).toBeUndefined();
  });

  it('extract_modified_recipe → isUpdate=true + originalRecipeId = id de la recette active', () => {
    const pending = buildPendingRecipeFromToolCall(
      { type: 'extract_modified_recipe', data: validData },
      activeRecipe,
    );
    expect(pending).not.toBeNull();
    expect(pending!.isUpdate).toBe(true);
    expect(pending!.originalRecipeId).toBe('recipe-42');
  });

  it('extract_modified_recipe sans recette active → originalRecipeId undefined', () => {
    const pending = buildPendingRecipeFromToolCall(
      { type: 'extract_modified_recipe', data: validData },
      null,
    );
    expect(pending!.isUpdate).toBe(true);
    expect(pending!.originalRecipeId).toBeUndefined();
  });

  it('create_new_recipe → relationToOriginal repris du payload', () => {
    const pending = buildPendingRecipeFromToolCall(
      { type: 'create_new_recipe', data: { ...validData, relation_to_original: 'variante' } },
      activeRecipe,
    );
    expect(pending!.relationToOriginal).toBe('variante');
    expect(pending!.isUpdate).toBeUndefined();
  });

  it('payload invalide → null (aucune recette mise en attente)', () => {
    const pending = buildPendingRecipeFromToolCall(
      { type: 'save_recipe', data: { title: '', ingredients: [], steps: [] } },
      null,
    );
    expect(pending).toBeNull();
  });

  it('type d\'action non géré → null', () => {
    const pending = buildPendingRecipeFromToolCall(
      { type: 'search_recipes', data: validData },
      null,
    );
    expect(pending).toBeNull();
  });
});

describe('buildPendingRecipeFromToolCall — propose_recipe', () => {
  const data = {
    title: 'Buddha bowl',
    servings: 2,
    ingredients: [{ name: 'Avocat', quantity: 1, unit: '' }],
    steps: [{ order: 1, text: 'Couper' }],
    intro: ['Avocat mûr et œufs mollets.', 'Champignons poêlés.'],
    introClosing: 'Assembler à la dernière minute.',
    tip: 'Poêler à feu vif pour garder du croquant.',
  };

  it('conserve les champs riches intro/introClosing/tip', () => {
    const out = buildPendingRecipeFromToolCall({ type: 'propose_recipe', data }, null);
    expect(out).not.toBeNull();
    expect(out!.title).toBe('Buddha bowl');
    expect(out!.intro).toEqual(['Avocat mûr et œufs mollets.', 'Champignons poêlés.']);
    expect(out!.introClosing).toBe('Assembler à la dernière minute.');
    expect(out!.tip).toBe('Poêler à feu vif pour garder du croquant.');
  });

  it('normalise intro_closing (snake_case émis par la tool def backend)', () => {
    const out = buildPendingRecipeFromToolCall(
      { type: 'propose_recipe', data: { ...data, introClosing: undefined, intro_closing: 'Assembler à la dernière minute.' } },
      null,
    );
    expect(out!.introClosing).toBe('Assembler à la dernière minute.');
  });

  it('coerce quantity string → number (nécessaire au recalcul des portions)', () => {
    const out = buildPendingRecipeFromToolCall(
      { type: 'propose_recipe', data: { ...data, ingredients: [{ name: 'Avocat', quantity: '1.5', unit: '' }] } },
      null,
    );
    expect(out!.ingredients[0].quantity).toBe(1.5);
  });

  it('normalise la virgule décimale française et zérise les valeurs texte', () => {
    const out = buildPendingRecipeFromToolCall(
      {
        type: 'propose_recipe',
        data: {
          ...data,
          ingredients: [
            { name: 'Lait', quantity: '1,5', unit: 'l' },
            { name: 'Sel', quantity: 'une pincée', unit: '' },
            { name: 'Poivre', quantity: '', unit: '' },
          ],
        },
      },
      null,
    );
    expect(out!.ingredients[0].quantity).toBe(1.5);
    expect(out!.ingredients[1].quantity).toBe(0); // 0 = non scalable, volontaire
    expect(out!.ingredients[2].quantity).toBe(0);
  });

  it('tolère l\'absence des champs riches (rétrocompat save_recipe)', () => {
    const out = buildPendingRecipeFromToolCall({ type: 'save_recipe', data: { ...data, intro: undefined, introClosing: undefined, tip: undefined } }, null);
    expect(out).not.toBeNull();
    expect(out!.intro).toBeUndefined();
  });
});

describe('buildPendingRecipeFromToolCall — title d’étape', () => {
  it('conserve steps[].title', () => {
    const out = buildPendingRecipeFromToolCall({
      type: 'propose_recipe',
      data: {
        title: 'Bowl', servings: 2,
        ingredients: [{ name: 'Avocat', quantity: 1, unit: '' }],
        steps: [{ order: 1, text: 'Faire cuire 6 min.', title: 'Cuire les œufs' }],
      },
    }, null);
    expect(out?.steps[0].title).toBe('Cuire les œufs');
  });
});
