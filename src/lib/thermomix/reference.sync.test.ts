import { describe, it, expect } from 'vitest';
import * as front from './reference';
import * as edge from '../../../supabase/functions/_shared/thermomix/reference.ts';

/**
 * Garde-fou de synchronisation : le miroir front `src/lib/thermomix/reference.ts`
 * doit rester équivalent à la source de vérité edge
 * `supabase/functions/_shared/thermomix/reference.ts`. Deno ne pouvant pas
 * importer depuis `src/`, les deux fichiers sont copiés à la main ; ce test
 * échoue à la moindre dérive (données ou comportement) et force la mise à jour.
 */

describe('référentiel TM7 — synchronisation edge/front', () => {
  it('constantes de plages identiques', () => {
    const snapshot = (m: typeof front) => ({
      TM7_SPEED_MIN: m.TM7_SPEED_MIN,
      TM7_SPEED_MAX: m.TM7_SPEED_MAX,
      TM7_SPEED_STEP: m.TM7_SPEED_STEP,
      TM7_STEAM_SPEED_MAX: m.TM7_STEAM_SPEED_MAX,
      TM7_TEMP_MIN: m.TM7_TEMP_MIN,
      TM7_TEMP_MAX: m.TM7_TEMP_MAX,
      TM7_BROWNING_TEMP_MIN: m.TM7_BROWNING_TEMP_MIN,
      TM7_MAX_SECONDS: m.TM7_MAX_SECONDS,
      VAROMA: m.VAROMA,
      TM7_SPECIAL_SPEEDS: [...m.TM7_SPECIAL_SPEEDS],
    });
    expect(snapshot(front)).toEqual(snapshot(edge));
  });

  it('tables identiques (modes, accessoires, barème)', () => {
    expect(front.TM7_MODES).toEqual(edge.TM7_MODES);
    expect(front.TM7_ACCESSORY_LABELS).toEqual(edge.TM7_ACCESSORY_LABELS);
    expect(front.TM7_CONVERSION_CHEATSHEET).toEqual(edge.TM7_CONVERSION_CHEATSHEET);
  });

  it('comportement des fonctions identique', () => {
    expect(front.buildTm7ReferenceForPrompt()).toBe(edge.buildTm7ReferenceForPrompt());

    const speeds = [5, 2.5, 25, 0, 'Turbo', 'mijotage', 'n’importe quoi'] as const;
    for (const s of speeds) {
      expect(front.normalizeSpeed(s)).toBe(edge.normalizeSpeed(s));
    }
    for (const t of [100, 165, 500, -5, front.VAROMA] as const) {
      expect(front.clampTemperature(t)).toBe(edge.clampTemperature(t));
    }
  });
});
