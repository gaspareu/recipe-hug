import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { generateImage } from "./generate-image.ts";
import { AIConfig } from "./ai-types.ts";

const GEMINI_CONFIG: AIConfig = {
  provider: "gemini",
  model: "gemini-2.5-flash-image",
  apiKey: "SECRET_GEMINI_KEY",
  endpoint: "",
};

const FLARE_CONFIG: AIConfig = {
  provider: "openai",
  model: "gpt-image-2.5-flare",
  apiKey: "SECRET_OPENAI_KEY",
  endpoint: "",
};

Deno.test("generateImage (Flare): envoie une requête 16:9 sans response_format et décode le JPEG", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};
  let capturedBody: Record<string, unknown> = {};

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
    capturedBody = JSON.parse(String(init?.body));
    return Promise.resolve(new Response(JSON.stringify({ data: [{ b64_json: btoa("jpeg-bytes") }] }), { status: 200 }));
  }) as typeof fetch;

  try {
    const image = await generateImage(FLARE_CONFIG, "photo d'un plat");
    assertEquals(capturedUrl, "https://api.openai.com/v1/images/generations");
    assertEquals(capturedHeaders.Authorization, "Bearer SECRET_OPENAI_KEY");
    assertEquals(capturedBody, {
      model: "gpt-image-2.5-flare",
      prompt: "photo d'un plat",
      n: 1,
      size: "1536x864",
      output_format: "jpeg",
    });
    assertEquals(image.mimeType, "image/jpeg");
    assertEquals(new TextDecoder().decode(image.bytes), "jpeg-bytes");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("generateImage (DALL-E 3): conserve le format de requête existant", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> = {};

  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body));
    return Promise.resolve(new Response(JSON.stringify({ data: [{ b64_json: btoa("png-bytes") }] }), { status: 200 }));
  }) as typeof fetch;

  try {
    const image = await generateImage({ ...FLARE_CONFIG, model: "dall-e-3" }, "photo d'un plat");
    assertEquals(capturedBody, {
      model: "dall-e-3",
      prompt: "photo d'un plat",
      n: 1,
      size: "1792x1024",
      response_format: "b64_json",
    });
    assertEquals(image.mimeType, "image/png");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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
