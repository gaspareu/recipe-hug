import type { UserCulinaryPreferences } from '@/hooks/useUserPreferences';

/** Opération de mise à jour des préférences émise par l'assistant (tool call). */
export interface PreferenceOperation {
  operation: 'add' | 'remove' | 'set';
  category: 'taste_preferences' | 'kitchen_equipment' | 'culinary_style' | 'dietary_constraints';
  field: string;
  values?: string[];
  value?: string | null;
}

/**
 * Applique une liste d'opérations (add/remove/set) sur des préférences culinaires
 * et retourne un NOUVEL objet (l'entrée n'est jamais mutée).
 * - `add` : union dédoublonnée des valeurs sur un champ tableau
 * - `remove` : retrait des valeurs d'un champ tableau
 * - `set` : affectation d'une valeur scalaire
 */
export function applyPreferenceOperations(
  preferences: UserCulinaryPreferences,
  operations: PreferenceOperation[],
): UserCulinaryPreferences {
  const updated = JSON.parse(JSON.stringify(preferences)) as UserCulinaryPreferences;
  for (const op of operations) {
    const category = updated[op.category] as unknown as Record<string, string[] | string | null>;
    if (!category) continue;
    if (op.operation === 'add' && op.values) {
      const current = (category[op.field] as string[]) || [];
      category[op.field] = [...new Set([...current, ...op.values])];
    } else if (op.operation === 'remove' && op.values) {
      const current = (category[op.field] as string[]) || [];
      category[op.field] = current.filter((v) => !op.values!.includes(v));
    } else if (op.operation === 'set') {
      category[op.field] = op.value ?? null;
    }
  }
  return updated;
}
