import { describe, it, expect } from 'vitest';
import { applyPreferenceOperations, type PreferenceOperation } from './preference-operations';
import type { UserCulinaryPreferences } from '@/hooks/useUserPreferences';

function prefs(overrides: Partial<UserCulinaryPreferences> = {}): UserCulinaryPreferences {
  return {
    id: 'p1',
    user_id: 'u1',
    created_at: '',
    updated_at: '',
    taste_preferences: {
      liked_flavors: ['sucré'],
      disliked_flavors: [],
      liked_ingredients: [],
      disliked_ingredients: [],
      special_ingredients: [],
    },
    kitchen_equipment: { available: [], unavailable: [] },
    culinary_style: { favorite_cuisines: [], favorite_techniques: [], preferred_difficulty: null },
    dietary_constraints: { allergies: ['gluten'], diets: [], restrictions: [] },
    ...overrides,
  };
}

describe('applyPreferenceOperations', () => {
  it("ajoute des valeurs en dédoublonnant", () => {
    const ops: PreferenceOperation[] = [
      { operation: 'add', category: 'dietary_constraints', field: 'allergies', values: ['gluten', 'arachides'] },
    ];
    const result = applyPreferenceOperations(prefs(), ops);
    expect(result.dietary_constraints.allergies).toEqual(['gluten', 'arachides']);
  });

  it("retire des valeurs", () => {
    const ops: PreferenceOperation[] = [
      { operation: 'remove', category: 'taste_preferences', field: 'liked_flavors', values: ['sucré'] },
    ];
    const result = applyPreferenceOperations(prefs(), ops);
    expect(result.taste_preferences.liked_flavors).toEqual([]);
  });

  it("affecte une valeur scalaire (set)", () => {
    const ops: PreferenceOperation[] = [
      { operation: 'set', category: 'culinary_style', field: 'preferred_difficulty', value: 'facile' },
    ];
    const result = applyPreferenceOperations(prefs(), ops);
    expect(result.culinary_style.preferred_difficulty).toBe('facile');
  });

  it("applique plusieurs opérations dans l'ordre", () => {
    const ops: PreferenceOperation[] = [
      { operation: 'add', category: 'dietary_constraints', field: 'allergies', values: ['arachides'] },
      { operation: 'remove', category: 'taste_preferences', field: 'liked_flavors', values: ['sucré'] },
      { operation: 'set', category: 'culinary_style', field: 'preferred_difficulty', value: 'moyen' },
    ];
    const result = applyPreferenceOperations(prefs(), ops);
    expect(result.dietary_constraints.allergies).toEqual(['gluten', 'arachides']);
    expect(result.taste_preferences.liked_flavors).toEqual([]);
    expect(result.culinary_style.preferred_difficulty).toBe('moyen');
  });

  it("ne mute pas l'objet d'entrée (immutabilité)", () => {
    const input = prefs();
    applyPreferenceOperations(input, [
      { operation: 'add', category: 'dietary_constraints', field: 'allergies', values: ['soja'] },
    ]);
    expect(input.dietary_constraints.allergies).toEqual(['gluten']);
  });
});
