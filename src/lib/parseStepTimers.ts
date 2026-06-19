/**
 * Découpe le texte d'une étape de recette en segments en isolant les durées
 * exprimées en minutes (« 6 min », « 30 minutes », « 3 mn »).
 *
 * Le découpage sert à deux usages :
 * - surligner visuellement les durées dans le texte de l'étape ;
 * - proposer des minuteurs pré-réglés correspondant à chaque durée détectée.
 */

export interface StepSegment {
  text: string;
  isDuration: boolean;
}

export interface ParsedStep {
  segments: StepSegment[];
  /** Durées détectées, en minutes, dans l'ordre d'apparition. */
  durations: number[];
}

// Un nombre suivi d'une unité de minutes : « min », « mn », « minute(s) ».
// Le `\b` final évite de capturer « minimum », « minced », etc.
const DURATION_REGEX = /(\d+)\s*(?:min(?:ute)?s?|mn)\b/gi;

export function parseStepTimers(text: string): ParsedStep {
  const segments: StepSegment[] = [];
  const durations: number[] = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  DURATION_REGEX.lastIndex = 0;

  while ((match = DURATION_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), isDuration: false });
    }
    segments.push({ text: match[0], isDuration: true });
    durations.push(parseInt(match[1], 10));
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isDuration: false });
  }

  return { segments, durations };
}
