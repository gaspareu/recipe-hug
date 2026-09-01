const SUGGESTIONS_BLOCK_REGEX = /\[suggestions\]\s*\[.*?\]\s*\[\/suggestions\]/gs;

function findJsonObjectEnd(content: string, start: number): number | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < content.length; index += 1) {
    const character = content[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return null;
}

function isAssistantAction(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.action === 'string'
    && Boolean(candidate.parameters)
    && typeof candidate.parameters === 'object'
    && !Array.isArray(candidate.parameters);
}

function stripActionPayloads(content: string): string {
  let output = '';
  let copiedUntil = 0;
  let searchFrom = 0;

  while (searchFrom < content.length) {
    const start = content.indexOf('{', searchFrom);
    if (start === -1) break;

    const end = findJsonObjectEnd(content, start);
    if (end === null) break;

    const candidate = content.slice(start, end + 1);
    try {
      if (isAssistantAction(JSON.parse(candidate))) {
        output += content.slice(copiedUntil, start);
        copiedUntil = end + 1;
      }
    } catch {
      // Un fragment qui ressemble à du JSON peut faire partie du texte visible.
    }

    searchFrom = end + 1;
  }

  return `${output}${content.slice(copiedUntil)}`;
}

/** Retire les enveloppes machine du contenu assistant avant affichage ou lecture. */
export function stripAssistantMetadata(content: string): string {
  return stripActionPayloads(content)
    .replace(SUGGESTIONS_BLOCK_REGEX, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Produit un texte naturel destiné au TTS, sans URLs, Markdown ni métadonnées. */
export function prepareTextForSpeech(content: string): string {
  return stripAssistantMetadata(content)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`~]/g, '')
    .replace(/^\s*[-+>]\s+/gm, '')
    .replace(/\n+/g, '. ')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{FE0F}\u{200D}]/gu, '')
    .replace(/(?:\.\s*){2,}/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Découpe les réponses longues sur une ponctuation pour réduire le temps avant lecture. */
export function splitTextForSpeech(content: string, maxLength = 1_200): string[] {
  const text = prepareTextForSpeech(content);
  if (!text) return [];
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    const minimumNaturalBreak = Math.floor(maxLength * 0.6);
    let breakAt = maxLength;

    for (const separator of ['. ', '! ', '? ', '; ', ', ', ' ']) {
      const candidate = remaining.lastIndexOf(separator, maxLength);
      if (candidate >= minimumNaturalBreak) {
        breakAt = candidate + (separator === ' ' ? 0 : 1);
        break;
      }
    }

    chunks.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}
