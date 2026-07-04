import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { generateImage } from "./generate-image.ts";
import { AIConfig } from "./ai-types.ts";

const GEMINI_CONFIG: AIConfig = {
  provider: "gemini",
  model: "gemini-2.5-flash-image",
  apiKey: "SECRET_GEMINI_KEY",
  endpoint: "",
};

/** Réponse Gemini factice contenant une image inline. */
function fakeGeminiImageResponse(): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        { content: { parts: [{ inlineData: { data: btoa("img-bytes"), mimeType: "image/png" } }] } },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

Deno.test("generateImage (gemini): la clé passe par l'en-tête x-goog-api-key, jamais dans l'URL", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
    return Promise.resolve(fakeGeminiImageResponse());
  }) as typeof fetch;

  try {
    await generateImage(GEMINI_CONFIG, "un plat appétissant");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert(
    !capturedUrl.includes("SECRET_GEMINI_KEY"),
    `La clé ne doit jamais apparaître dans l'URL (fuite via message d'erreur fetch) : ${capturedUrl}`,
  );
  assertEquals(capturedHeaders["x-goog-api-key"], "SECRET_GEMINI_KEY");
});
