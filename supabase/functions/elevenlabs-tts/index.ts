import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

import { corsHeaders } from "../_shared/cors.ts";
import {
  createTimeoutSignal,
  ELEVENLABS_TTS_VOICE_ID,
  mapElevenLabsError,
  parseTtsRequest,
  parseVoiceQuotaDecision,
} from "../_shared/elevenlabs.ts";

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function jsonResponse(payload: Record<string, unknown>, status: number, headers?: HeadersInit) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...jsonHeaders, ...headers },
  });
}

export async function handleElevenLabsTts(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, { Allow: "POST, OPTIONS" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Authentication required" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const elevenLabsApiKey = Deno.env.get("ELEVENLABS_API_KEY");
  const zeroRetentionEnabled = Deno.env.get("ELEVENLABS_ZERO_RETENTION_MODE") === "true";
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !elevenLabsApiKey) {
    console.error("ElevenLabs TTS is missing required server configuration");
    return jsonResponse({ error: "Voice service unavailable" }, 503);
  }

  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.slice("Bearer ".length);
  const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return jsonResponse({ error: "Invalid token" }, 401);
  }
  const userId = claimsData.claims.sub;
  if (typeof userId !== "string" || !userId) {
    return jsonResponse({ error: "Invalid token" }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const parsed = parseTtsRequest(body);
  if (!parsed.ok) return jsonResponse({ error: parsed.error }, 400);

  const quotaClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: quotaData, error: quotaError } = await quotaClient.rpc(
    "consume_voice_quota",
    { p_user_id: userId, p_scope: "tts", p_cost: parsed.text.length },
  );
  const quota = parseVoiceQuotaDecision(quotaData);
  if (quotaError || !quota) {
    console.error("Voice quota check failed", { code: quotaError?.code });
    return jsonResponse({ error: "Voice service unavailable" }, 503);
  }
  if (!quota.allowed) {
    return jsonResponse(
      { error: "Voice request limit reached" },
      429,
      { "Retry-After": String(quota.retryAfterSeconds) },
    );
  }

  console.log("TTS request", { characterCount: parsed.text.length });

  const timeout = createTimeoutSignal();
  try {
    const elevenLabsUrl = new URL(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_TTS_VOICE_ID}/stream`,
    );
    elevenLabsUrl.searchParams.set("output_format", "mp3_44100_128");
    elevenLabsUrl.searchParams.set("enable_logging", String(!zeroRetentionEnabled));
    const response = await fetch(
      elevenLabsUrl,
      {
        method: "POST",
        headers: {
          "xi-api-key": elevenLabsApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: parsed.text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
        signal: timeout.signal,
      },
    );

    if (!response.ok) {
      timeout.clear();
      const mapped = mapElevenLabsError(response.status);
      const retryAfter = response.headers.get("Retry-After");
      console.error("ElevenLabs TTS upstream failure", {
        status: response.status,
        requestId: response.headers.get("request-id"),
      });
      return jsonResponse(
        { error: mapped.message },
        mapped.status,
        retryAfter ? { "Retry-After": retryAfter } : undefined,
      );
    }

    if (!response.body) {
      timeout.clear();
      return jsonResponse({ error: "Voice service returned no audio" }, 502);
    }

    // Après les en-têtes, le délai devient un timeout d'inactivité : une longue
    // synthèse reste valide tant que le fournisseur continue d'envoyer des octets.
    timeout.reset();
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        timeout.reset();
        controller.enqueue(chunk);
      },
    });
    void response.body
      .pipeTo(writable, { signal: timeout.signal })
      .catch((error) => {
        if (!(error instanceof Error && error.name === "AbortError")) {
          console.error("ElevenLabs TTS stream failed");
        }
      })
      .finally(timeout.clear);

    return new Response(readable, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": response.headers.get("Content-Type") ?? "audio/mpeg",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    timeout.clear();
    const timedOut = error instanceof Error && error.name === "AbortError";
    console.error("ElevenLabs TTS request failed", { timedOut });
    return jsonResponse(
      { error: timedOut ? "Voice service timed out" : "TTS failed" },
      timedOut ? 504 : 500,
    );
  }
}

if (import.meta.main) Deno.serve(handleElevenLabsTts);
