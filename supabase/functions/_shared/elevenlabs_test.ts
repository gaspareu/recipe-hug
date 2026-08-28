import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

import {
  ELEVENLABS_TTS_VOICE_ID,
  mapElevenLabsError,
  parseTtsRequest,
  parseVoiceQuotaDecision,
  readJsonBodyWithLimit,
} from "./elevenlabs.ts";

Deno.test("parseTtsRequest nettoie et limite le texte sans accepter de voix cliente", () => {
  assertEquals(parseTtsRequest({ text: "  Bonjour  ", voiceId: "voix-inconnue" }), {
    ok: true,
    text: "Bonjour",
  });
  assertEquals(typeof ELEVENLABS_TTS_VOICE_ID, "string");
  assertEquals(ELEVENLABS_TTS_VOICE_ID.length > 0, true);
});

Deno.test("parseTtsRequest refuse les corps invalides et les textes trop longs", () => {
  assertEquals(parseTtsRequest(null), {
    ok: false,
    error: "Invalid JSON body",
  });
  assertEquals(parseTtsRequest({ text: "   " }), {
    ok: false,
    error: "Text is required",
  });
  assertEquals(parseTtsRequest({ text: "a".repeat(5_001) }), {
    ok: false,
    error: "Text too long (max 5000 characters)",
  });
});

Deno.test("readJsonBodyWithLimit borne le corps avant le parsing JSON", async () => {
  const valid = await readJsonBodyWithLimit(new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify({ text: "Bonjour" }),
  }), 128);
  assertEquals(valid, { ok: true, value: { text: "Bonjour" } });

  const oversized = await readJsonBodyWithLimit(new Request("http://localhost", {
    method: "POST",
    body: "x".repeat(129),
  }), 128);
  assertEquals(oversized, {
    ok: false,
    status: 413,
    error: "Request body too large",
  });
});

Deno.test("mapElevenLabsError préserve la saturation et masque les erreurs fournisseur", () => {
  assertEquals(mapElevenLabsError(429), {
    status: 429,
    message: "Voice service rate limit reached",
  });
  assertEquals(mapElevenLabsError(503), {
    status: 503,
    message: "Voice service temporarily unavailable",
  });
  assertEquals(mapElevenLabsError(401), {
    status: 502,
    message: "Voice service request failed",
  });
});

Deno.test("parseVoiceQuotaDecision valide strictement la réponse atomique Postgres", () => {
  assertEquals(parseVoiceQuotaDecision([{ allowed: true, retry_after_seconds: 0 }]), {
    allowed: true,
    retryAfterSeconds: 0,
  });
  assertEquals(parseVoiceQuotaDecision([{ allowed: false, retry_after_seconds: 2.2 }]), {
    allowed: false,
    retryAfterSeconds: 3,
  });
  assertEquals(parseVoiceQuotaDecision([]), null);
  assertEquals(parseVoiceQuotaDecision([{ allowed: "yes", retry_after_seconds: 0 }]), null);
});
