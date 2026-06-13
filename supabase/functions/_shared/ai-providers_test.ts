import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { transformAnthropicStreamToOpenAI } from "./ai-providers.ts";

/** Construit une Response SSE imitant le flux natif de l'API Anthropic. */
function anthropicSSE(events: object[]): Response {
  const body = events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(new Blob([body]).stream(), {
    headers: { "Content-Type": "text/event-stream" },
  });
}

interface OpenAIChunk {
  choices: Array<{
    delta: { content?: string; tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> };
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

Deno.test("transform: termine toujours par [DONE]", async () => {
  const res = transformAnthropicStreamToOpenAI(anthropicSSE([
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } },
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
