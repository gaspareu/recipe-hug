import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { callAINonStreaming } from "../ai-providers.ts";
import { ADAPTATION_JSON_SCHEMA } from "./adaptation-format.ts";

Deno.test("JSON structuré Anthropic conserve l'effort existant, le signal et les métriques sans exposer la clé", async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  let request: Record<string, unknown> = {};
  let signal: AbortSignal | null | undefined;
  let usage: unknown;
  globalThis.fetch = (_input, init) => {
    request = JSON.parse(String(init?.body));
    signal = init?.signal;
    return Promise.resolve(
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: "{}" }],
          usage: { input_tokens: 10, output_tokens: 2 },
        }),
      ),
    );
  };
  try {
    const result = await callAINonStreaming(
      {
        provider: "anthropic",
        model: "claude-sonnet-5-5",
        endpoint: "https://api.anthropic.com/v1/messages",
        apiKey: "test-private-key",
      },
      [{ role: "user", content: "Test" }],
      controller.signal,
      {
        jsonSchema: ADAPTATION_JSON_SCHEMA,
        onUsage: (value) => {
          usage = value;
        },
      },
    );
    assertEquals(result, "{}");
    assertEquals(signal, controller.signal);
    assertEquals(request.output_config, {
      effort: "medium",
      format: { type: "json_schema", schema: ADAPTATION_JSON_SCHEMA },
    });
    assertEquals(usage, { input_tokens: 10, output_tokens: 2 });
    assertEquals(JSON.stringify(request).includes("test-private-key"), false);
  } finally {
    globalThis.fetch = original;
  }
});
