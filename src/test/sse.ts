/**
 * Helpers pour simuler le flux SSE (format OpenAI-compatible) renvoyé par
 * l'edge function `home-assistant`. Le moteur de chat (`useChatEngine`) lit
 * `response.body.getReader()` et parse les lignes `data: {JSON}` jusqu'à
 * `data: [DONE]`.
 */

/** Événement SSE de contenu texte incrémental. */
export function contentEvent(text: string) {
  return { choices: [{ delta: { content: text } }] };
}

/**
 * Événement SSE portant un tool call complet (nom + arguments JSON) avec
 * `finish_reason: "tool_calls"` pour déclencher son exécution immédiate.
 */
export function toolCallEvent(name: string, args: Record<string, unknown>) {
  return {
    choices: [
      {
        delta: { tool_calls: [{ function: { name, arguments: JSON.stringify(args) } }] },
        finish_reason: "tool_calls",
      },
    ],
  };
}

/** Sérialise des événements en payload SSE terminé par `[DONE]`. */
export function toSSEPayload(events: Array<object | string>): string {
  const lines = events.map((e) =>
    typeof e === "string" ? `data: ${e}\n` : `data: ${JSON.stringify(e)}\n`,
  );
  return lines.join("") + "data: [DONE]\n";
}

/**
 * Fausse réponse fetch streamable : chaque élément de `chunks` est délivré
 * comme un chunk distinct par le reader (permet de tester le buffering des
 * lignes coupées en plein milieu).
 */
export function responseFromChunks(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const encoded = chunks.map((c) => encoder.encode(c));
  let index = 0;
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    body: {
      getReader: () => ({
        read: () =>
          Promise.resolve(
            index < encoded.length
              ? { done: false, value: encoded[index++] }
              : { done: true, value: undefined },
          ),
      }),
    },
  } as unknown as Response;
}

/** Fausse réponse fetch SSE délivrant tous les événements en un seul chunk. */
export function sseResponse(events: Array<object | string>): Response {
  return responseFromChunks([toSSEPayload(events)]);
}

/** Fausse réponse fetch en erreur HTTP (sans corps streamable). */
export function httpErrorResponse(status: number, body: Record<string, unknown> = {}): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve(body),
    body: null,
  } as unknown as Response;
}
