import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

import { corsHeaders } from "../_shared/cors.ts";
import {
  createTimeoutSignal,
  mapElevenLabsError,
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

export async function handleElevenLabsScribeToken(req: Request): Promise<Response> {
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
    console.error("ElevenLabs Scribe is missing required server configuration");
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

  const quotaClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: quotaData, error: quotaError } = await quotaClient.rpc(
    "consume_voice_quota",
    { p_user_id: userId, p_scope: "scribe", p_cost: 1 },
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

  console.log("Scribe token request authenticated");

  const timeout = createTimeoutSignal();
  try {
    const response = await fetch(
      "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
      {
        method: "POST",
        headers: { "xi-api-key": elevenLabsApiKey },
        signal: timeout.signal,
      },
    );
    if (!response.ok) {
      timeout.clear();
      const mapped = mapElevenLabsError(response.status);
      const retryAfter = response.headers.get("Retry-After");
      console.error("ElevenLabs Scribe upstream failure", {
        status: response.status,
        requestId: response.headers.get("request-id"),
      });
      return jsonResponse(
        { error: mapped.message },
        mapped.status,
        retryAfter ? { "Retry-After": retryAfter } : undefined,
      );
    }

    const data: unknown = await response.json();
    timeout.clear();
    const scribeToken = data && typeof data === "object"
      ? (data as Record<string, unknown>).token
      : undefined;
    if (typeof scribeToken !== "string" || !scribeToken) {
      return jsonResponse({ error: "Voice service returned an invalid token" }, 502);
    }

    return jsonResponse({ token: scribeToken, enableLogging: !zeroRetentionEnabled }, 200);
  } catch (error) {
    timeout.clear();
    const timedOut = error instanceof Error && error.name === "AbortError";
    console.error("ElevenLabs Scribe request failed", { timedOut });
    return jsonResponse(
      { error: timedOut ? "Voice service timed out" : "Token generation failed" },
      timedOut ? 504 : 500,
    );
  }
}

if (import.meta.main) Deno.serve(handleElevenLabsScribeToken);
