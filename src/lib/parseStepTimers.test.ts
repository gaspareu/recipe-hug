import { describe, it, expect } from 'vitest';
import { parseStepTimers } from './parseStepTimers';

describe('parseStepTimers', () => {
  it('renvoie un seul segment non-durée quand le texte ne contient aucune durée', () => {
    const { segments, durations } = parseStepTimers('Émincez les champignons finement.');
    expect(segments).toEqual([{ text: 'Émincez les champignons finement.', isDuration: false }]);
    expect(durations).toEqual([]);
  });

  it('isole une durée « 6 min » et la signale comme durée', () => {
    const { segments, durations } = parseStepTimers('Faites cuire 6 min puis égouttez.');
    expect(segments).toEqual([
      { text: 'Faites cuire ', isDuration: false },
      { text: '6 min', isDuration: true },
      { text: ' puis égouttez.', isDuration: false },
    ]);
    expect(durations).toEqual([6]);
  });

  it('détecte plusieurs durées dans l’ordre du texte', () => {
    const { durations } = parseStepTimers('Poêlez 10 min, laissez reposer 5 min.');
    expect(durations).toEqual([10, 5]);
  });

  it('gère une durée en début de texte sans segment vide initial', () => {
    const { segments, durations } = parseStepTimers('25 min au four à 180°C.');
    expect(segments[0]).toEqual({ text: '25 min', isDuration: true });
    expect(durations).toEqual([25]);
  });

  it('reconnaît les variantes « minute(s) » et « mn »', () => {
    expect(parseStepTimers('reposer 30 minutes').durations).toEqual([30]);
    expect(parseStepTimers('cuire 3 mn').durations).toEqual([3]);
  });

  it('ignore un « min » non précédé d’un nombre', () => {
    const { durations } = parseStepTimers('au minimum, salez.');
    expect(durations).toEqual([]);
  });
});
