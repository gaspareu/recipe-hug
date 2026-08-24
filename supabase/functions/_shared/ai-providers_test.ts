import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { callAIStreaming, transformAnthropicStreamToOpenAI, transformGeminiStreamToOpenAI } from "./ai-providers.ts";
import { AIConfig } from "./ai-types.ts";

Deno.test("callAIStreaming (gemini natif): la clé passe par l'en-tête x-goog-api-key, jamais dans l'URL", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
    return Promise.resolve(
      new Response(JSON.stringify({ candidates: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as typeof fetch;

  const config: AIConfig = { provider: "gemini", model: "gemini-2.5-flash", apiKey: "SECRET_GEMINI_KEY", endpoint: "" };
  try {
    await callAIStreaming(config, [{ role: "user", content: "salut" }], { stream: false });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert(!capturedUrl.includes("SECRET_GEMINI_KEY"), `La clé ne doit jamais apparaître dans l'URL : ${capturedUrl}`);
  assertEquals(capturedHeaders["x-goog-api-key"], "SECRET_GEMINI_KEY");
});

Deno.test("callAIStreaming (gemini natif, streaming): la requête demande le flux SSE (alt=sse)", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";

  globalThis.fetch = ((input: string | URL | Request, _init?: RequestInit) => {
    capturedUrl = String(input);
    return Promise.resolve(
      new Response(new Blob([""]).stream(), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
  }) as typeof fetch;

  const config: AIConfig = { provider: "gemini", model: "gemini-2.5-flash", apiKey: "K", endpoint: "" };
  try {
    await callAIStreaming(config, [{ role: "user", content: "salut" }], { stream: true });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert(capturedUrl.includes("streamGenerateContent"), `endpoint streaming attendu : ${capturedUrl}`);
  assert(capturedUrl.includes("alt=sse"), `Le streaming doit demander le flux SSE : ${capturedUrl}`);
});

Deno.test("callAIStreaming (Anthropic): préserve le MIME d'image et propage l'annulation", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> = {};
  let capturedSignal: AbortSignal | undefined;
  const controller = new AbortController();

  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body));
    capturedSignal = init?.signal ?? undefined;
    return Promise.resolve(new Response(JSON.stringify({ content: [] }), { status: 200 }));
  }) as typeof fetch;

  const config: AIConfig = { provider: "anthropic", model: "claude-sonnet-5", apiKey: "K", endpoint: "https://anthropic.test/messages" };
  try {
    await callAIStreaming(config, [{
      role: "user",
      content: [{ type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } }],
    }], { stream: false, signal: controller.signal });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const messages = capturedBody.messages as Array<{ content: Array<{ source?: { media_type?: string } }> }>;
  assertEquals(messages[0].content[0].source?.media_type, "image/png");
  assertEquals(capturedSignal, controller.signal);
});

/** Construit une Response SSE imitant le flux natif de l'API Anthropic. */
function anthropicSSE(events: object[]): Response {
  const body = events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(new Blob([body]).stream(), {
    headers: { "Content-Type": "text/event-stream" },
  });
}

interface OpenAIChunk {
  choices: Array<{
    delta: { content?: string; tool_calls?: Array<{ index?: number; function?: { name?: string; arguments?: string } }> };
    finish_reason?: string;
  }>;
}

/** Lit tous les chunks `data: {...}` émis par le flux transformé (hors [DONE]). */
async function readOpenAIChunks(res: Response): Promise<OpenAIChunk[]> {
  const text = await res.text();
  return text
    .split("\n")
    .filter((l) => l.startsWith("data: ") && !l.includes("[DONE]"))
    .map((l) => JSON.parse(l.slice(6)));
}

Deno.test("transform: les deltas de texte deviennent des deltas de contenu OpenAI", async () => {
  const res = transformAnthropicStreamToOpenAI(anthropicSSE([
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Bon" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "jour" } },
    { type: "content_block_stop", index: 0 },
  ]));

  const chunks = await readOpenAIChunks(res);
  const content = chunks.map((c) => c.choices[0].delta.content).filter(Boolean).join("");
  assertEquals(content, "Bonjour");
});

Deno.test("transform: un bloc tool_use émet nom, arguments accumulés et finish_reason", async () => {
  const res = transformAnthropicStreamToOpenAI(anthropicSSE([
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "save_recipe", input: {} } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"title":"Tar' } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: 'te","servings":4}' } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "tool_use" } },
  ]));

  const chunks = await readOpenAIChunks(res);

  // Le nom de l'outil est émis une fois.
  const names = chunks.flatMap((c) => c.choices[0].delta.tool_calls ?? []).map((t) => t.function?.name).filter(Boolean);
  assertEquals(names, ["save_recipe"]);

  // Les arguments JSON se reconstituent à l'identique.
  const args = chunks.flatMap((c) => c.choices[0].delta.tool_calls ?? []).map((t) => t.function?.arguments ?? "").join("");
  assertEquals(JSON.parse(args), { title: "Tarte", servings: 4 });

  // Le front s'appuie sur finish_reason === "tool_calls" pour exécuter l'outil.
  const finish = chunks.map((c) => c.choices[0].finish_reason).filter(Boolean);
  assertEquals(finish, ["tool_calls"]);
});

Deno.test("transform: une erreur Anthropic mi-stream fait échouer le flux (pas de succès silencieux)", async () => {
  const res = transformAnthropicStreamToOpenAI(anthropicSSE([
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Bonj" } },
    { type: "error", error: { type: "overloaded_error", message: "Overloaded" } },
  ]));

  let threw = false;
  try {
    await res.text(); // consomme le flux transformé jusqu'au bout
  } catch {
    threw = true;
  }
  assertEquals(threw, true, "Le flux doit être en erreur, pas clôturé proprement par [DONE]");
});

Deno.test("transform: deux tool_use reçoivent des index de tool_call distincts (0 puis 1)", async () => {
  const res = transformAnthropicStreamToOpenAI(anthropicSSE([
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_a", name: "navigate", input: {} } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"destination":"home"}' } },
    { type: "content_block_stop", index: 0 },
    { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_b", name: "get_preferences", input: {} } },
    { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{}" } },
    { type: "content_block_stop", index: 1 },
  ]));

  const chunks = await readOpenAIChunks(res);
  const toolCalls = chunks.flatMap((c) => c.choices[0].delta.tool_calls ?? []);

  // Chaque bloc tool_use porte un index distinct (pas 0 partout) : le nom et les
  // arguments de chaque outil restent rattachés au bon appel.
  const nameAt = (i: number) => toolCalls.find((t) => t.index === i && t.function?.name)?.function?.name;
  const argsAt = (i: number) => toolCalls.filter((t) => t.index === i).map((t) => t.function?.arguments ?? "").join("");
  assertEquals(nameAt(0), "navigate");
  assertEquals(nameAt(1), "get_preferences");
  assertEquals(JSON.parse(argsAt(0)), { destination: "home" });
  assertEquals(JSON.parse(argsAt(1)), {});
});

Deno.test("transform: chaque tool_use émet son propre finish_reason (le consommateur exécute chaque outil)", async () => {
  const res = transformAnthropicStreamToOpenAI(anthropicSSE([
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_a", name: "navigate", input: {} } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{}" } },
    { type: "content_block_stop", index: 0 },
    { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_b", name: "get_preferences", input: {} } },
    { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{}" } },
    { type: "content_block_stop", index: 1 },
  ]));

  const chunks = await readOpenAIChunks(res);
  const finish = chunks.map((c) => c.choices[0].finish_reason).filter(Boolean);
  // Un finish_reason par outil : useChatEngine réinitialise son accumulateur à
  // chaque finish_reason, ce qui lui permet d'exécuter les deux outils.
  assertEquals(finish, ["tool_calls", "tool_calls"]);
});

Deno.test("transform: termine toujours par [DONE]", async () => {
  const res = transformAnthropicStreamToOpenAI(anthropicSSE([
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } },
  ]));
  const text = await res.text();
  assertEquals(text.trimEnd().endsWith("data: [DONE]"), true);
});

// ============================================================
// Gemini (flux SSE natif : `data: {GenerateContentResponse}`)
// ============================================================

/** Construit une Response SSE imitant le flux natif de Gemini (`?alt=sse`). */
function geminiSSE(chunks: object[]): Response {
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("");
  return new Response(new Blob([body]).stream(), {
    headers: { "Content-Type": "text/event-stream" },
  });
}

Deno.test("transform gemini: les parts de texte deviennent des deltas de contenu OpenAI", async () => {
  const res = transformGeminiStreamToOpenAI(geminiSSE([
    { candidates: [{ content: { role: "model", parts: [{ text: "Bon" }] } }] },
    { candidates: [{ content: { role: "model", parts: [{ text: "jour" }] } }] },
  ]));

  const chunks = await readOpenAIChunks(res);
  const content = chunks.map((c) => c.choices[0].delta.content).filter(Boolean).join("");
  assertEquals(content, "Bonjour");
});

Deno.test("transform gemini: un functionCall émet nom, arguments et finish_reason tool_calls", async () => {
  const res = transformGeminiStreamToOpenAI(geminiSSE([
    { candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "save_recipe", args: { title: "Tarte", servings: 4 } } }] }, finishReason: "STOP" }] },
  ]));

  const chunks = await readOpenAIChunks(res);

  const names = chunks.flatMap((c) => c.choices[0].delta.tool_calls ?? []).map((t) => t.function?.name).filter(Boolean);
  assertEquals(names, ["save_recipe"]);

  const args = chunks.flatMap((c) => c.choices[0].delta.tool_calls ?? []).map((t) => t.function?.arguments ?? "").join("");
  assertEquals(JSON.parse(args), { title: "Tarte", servings: 4 });

  // Le front s'appuie sur finish_reason === "tool_calls" pour exécuter l'outil
  // (aujourd'hui absent côté Gemini → outils jamais exécutés).
  const finish = chunks.map((c) => c.choices[0].finish_reason).filter(Boolean);
  assertEquals(finish, ["tool_calls"]);
});

Deno.test("transform gemini: deux functionCall reçoivent des index distincts + un finish_reason chacun", async () => {
  const res = transformGeminiStreamToOpenAI(geminiSSE([
    { candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "navigate", args: { destination: "home" } } }] } }] },
    { candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "get_preferences", args: {} } }] }, finishReason: "STOP" }] },
  ]));

  const chunks = await readOpenAIChunks(res);
  const toolCalls = chunks.flatMap((c) => c.choices[0].delta.tool_calls ?? []);

  const nameAt = (i: number) => toolCalls.find((t) => t.index === i && t.function?.name)?.function?.name;
  const argsAt = (i: number) => toolCalls.filter((t) => t.index === i).map((t) => t.function?.arguments ?? "").join("");
  assertEquals(nameAt(0), "navigate");
  assertEquals(nameAt(1), "get_preferences");
  assertEquals(JSON.parse(argsAt(0)), { destination: "home" });
  assertEquals(JSON.parse(argsAt(1)), {});

  const finish = chunks.map((c) => c.choices[0].finish_reason).filter(Boolean);
  assertEquals(finish, ["tool_calls", "tool_calls"]);
});

Deno.test("transform gemini: une erreur mi-stream fait échouer le flux (pas de succès silencieux)", async () => {
  const res = transformGeminiStreamToOpenAI(geminiSSE([
    { candidates: [{ content: { role: "model", parts: [{ text: "Bonj" }] } }] },
    { error: { code: 503, message: "The model is overloaded.", status: "UNAVAILABLE" } },
  ]));

  let threw = false;
  try {
    await res.text();
  } catch {
    threw = true;
  }
  assertEquals(threw, true, "Le flux doit être en erreur, pas clôturé proprement par [DONE]");
});

Deno.test("transform gemini: termine toujours par [DONE]", async () => {
  const res = transformGeminiStreamToOpenAI(geminiSSE([
    { candidates: [{ content: { role: "model", parts: [{ text: "ok" }] } }] },
  ]));
  const text = await res.text();
  assertEquals(text.trimEnd().endsWith("data: [DONE]"), true);
});

Deno.test("transform: le texte et un tool_use successifs coexistent dans le flux", async () => {
  const res = transformAnthropicStreamToOpenAI(anthropicSSE([
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Je prépare ça." } },
    { type: "content_block_stop", index: 0 },
    { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_2", name: "navigate", input: {} } },
    { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"destination":"profile"}' } },
    { type: "content_block_stop", index: 1 },
  ]));

  const chunks = await readOpenAIChunks(res);
  const content = chunks.map((c) => c.choices[0].delta.content).filter(Boolean).join("");
  const args = chunks.flatMap((c) => c.choices[0].delta.tool_calls ?? []).map((t) => t.function?.arguments ?? "").join("");
  assertEquals(content, "Je prépare ça.");
  assertEquals(JSON.parse(args), { destination: "profile" });
});
