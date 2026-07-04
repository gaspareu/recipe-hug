import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RequestSchema = z.object({
  provider: z.enum(["gemini", "openai", "anthropic"]),
  api_key: z.string().min(1, "API key is required"),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Missing required environment variables");
    }

    // Verify JWT
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate input
    const body = await req.json();
    const parseResult = RequestSchema.safeParse(body);

    if (!parseResult.success) {
      return new Response(
        JSON.stringify({ error: "validation_error", message: parseResult.error.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { provider, api_key } = parseResult.data;

    console.log("Validating API key for provider:", provider);

    let valid = false;
    let errorMessage: string | null = null;

    try {
      switch (provider) {
        case "gemini": {
          // Test Gemini API with a simple models list request.
          // Clé via l'en-tête `x-goog-api-key`, jamais en query string
          // (une erreur réseau exposerait l'URL, donc la clé).
          const response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models",
            { method: "GET", headers: { "x-goog-api-key": api_key } }
          );
          
          if (response.ok) {
            valid = true;
          } else {
            const errorData = await response.json().catch(() => ({}));
            errorMessage = errorData.error?.message || `Erreur ${response.status}`;
          }
          break;
        }

        case "openai": {
          // Test OpenAI API with a models list request
          const response = await fetch("https://api.openai.com/v1/models", {
            method: "GET",
            headers: {
              Authorization: `Bearer ${api_key}`,
            },
          });

          if (response.ok) {
            valid = true;
          } else {
            const errorData = await response.json().catch(() => ({}));
            errorMessage = errorData.error?.message || `Erreur ${response.status}`;
          }
          break;
        }

        case "anthropic": {
          // Test Anthropic API with a minimal message request
          const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": api_key,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-6",
              max_tokens: 1,
              messages: [{ role: "user", content: "Hi" }],
            }),
          });

          console.log("Anthropic response status:", response.status);
          const responseBody = await response.text();
          console.log("Anthropic response body:", responseBody);

          // Valid keys: 200 (success) or 429 (rate limited) or 529 (overloaded)
          // Invalid keys: 401
          if (response.ok || response.status === 429 || response.status === 529) {
            valid = true;
          } else if (response.status === 401) {
            errorMessage = "Clé API invalide";
          } else {
            try {
              const errorData = JSON.parse(responseBody);
              errorMessage = errorData.error?.message || `Erreur ${response.status}`;
            } catch {
              errorMessage = `Erreur ${response.status}`;
            }
          }
          break;
        }
      }
    } catch (e) {
      console.error("Error validating API key:", e);
      errorMessage = "Erreur de connexion au service";
    }

    console.log("Validation result:", { provider, valid, errorMessage });

    return new Response(
      JSON.stringify({ valid, error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("validate-ai-key error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
