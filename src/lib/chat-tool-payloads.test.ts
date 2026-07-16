import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseRecipePayload,
  parsePreferenceOperations,
  buildPendingRecipeFromToolCall,
} from './chat-tool-payloads';

// Les payloads viennent du LLM (via le stream d'outils) : données externes non
// fiables. On valide la STRUCTURE en restant tolérant sur les types que le
// modèle produit réellement (quantity string OU number selon l'outil).

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
