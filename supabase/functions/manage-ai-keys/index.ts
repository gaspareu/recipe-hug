import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { encryptValue, decryptValue, maskApiKey } from "../_shared/decrypt-keys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const ENCRYPTION_SECRET = Deno.env.get("AI_KEYS_ENCRYPTION_SECRET");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Missing required environment variables");
    }

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { provider, preferred_model, agent_configs, provider_api_keys, api_key } = body;

      // Read existing settings to preserve encrypted keys not being updated
      const { data: existing } = await supabaseClient
        .from("user_ai_settings")
        .select("provider_api_keys, api_key")
        .eq("user_id", user.id)
        .maybeSingle();

      const existingKeys = existing?.provider_api_keys || {};
      const encryptedKeys: Record<string, string> = {};

      // For each provider: encrypt new key or keep existing encrypted value
      for (const p of ["gemini", "openai", "anthropic"]) {
        const newKey = provider_api_keys?.[p];
        if (newKey && typeof newKey === "string" && newKey.trim()) {
          // New key provided - encrypt it
          encryptedKeys[p] = ENCRYPTION_SECRET
            ? await encryptValue(newKey.trim(), ENCRYPTION_SECRET)
            : newKey.trim();
        } else if (existingKeys[p]) {
          // Keep existing encrypted value
          encryptedKeys[p] = existingKeys[p];
        }
      }

      // Handle legacy api_key
      let finalApiKey = existing?.api_key || null;
      if (api_key && typeof api_key === "string" && api_key.trim()) {
        finalApiKey = ENCRYPTION_SECRET
          ? await encryptValue(api_key.trim(), ENCRYPTION_SECRET)
          : api_key.trim();
      }

      const payload = {
        user_id: user.id,
        provider: provider || "anthropic",
        preferred_model: preferred_model || null,
        agent_configs: agent_configs || {},
        provider_api_keys: encryptedKeys,
        api_key: finalApiKey,
      };

      const { data, error } = await supabaseClient
        .from("user_ai_settings")
        .upsert(payload, { onConflict: "user_id" })
        .select()
        .single();

      if (error) throw error;

      // Return masked keys info (not the encrypted values)
      const maskedKeys: Record<string, { has_key: boolean; masked: string | null }> = {};
      for (const p of ["gemini", "openai", "anthropic"]) {
        const newKey = provider_api_keys?.[p];
        if (newKey && typeof newKey === "string" && newKey.trim()) {
          maskedKeys[p] = { has_key: true, masked: maskApiKey(newKey.trim()) };
        } else if (existingKeys[p]) {
          // Decrypt existing to mask it
          let plain = existingKeys[p];
          if (ENCRYPTION_SECRET) {
            try {
              plain = await decryptValue(existingKeys[p], ENCRYPTION_SECRET);
            } catch {
              // Already plaintext
            }
          }
          maskedKeys[p] = { has_key: true, masked: maskApiKey(plain) };
        } else {
          maskedKeys[p] = { has_key: false, masked: null };
        }
      }

      return new Response(
        JSON.stringify({ success: true, masked_keys: maskedKeys }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "GET") {
      // Return masked keys info
      const { data, error } = await supabaseClient
        .from("user_ai_settings")
        .select("provider_api_keys")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      const keys = data?.provider_api_keys || {};
      const maskedKeys: Record<string, { has_key: boolean; masked: string | null }> = {};

      for (const p of ["gemini", "openai", "anthropic"]) {
        const rawKey = keys[p];
        if (rawKey) {
          let plain = rawKey;
          if (ENCRYPTION_SECRET) {
            try {
              plain = await decryptValue(rawKey, ENCRYPTION_SECRET);
              console.log(`[manage-ai-keys GET] ${p}: decrypted OK`);
            } catch (err) {
              console.warn(`[manage-ai-keys GET] ${p}: decrypt FAILED, using as plaintext`);
              // Already plaintext
            }
          } else {
            console.warn(`[manage-ai-keys GET] ${p}: no ENCRYPTION_SECRET, using raw key`);
          }
          maskedKeys[p] = { has_key: true, masked: maskApiKey(plain) };
        } else {
          maskedKeys[p] = { has_key: false, masked: null };
        }
      }

      return new Response(
        JSON.stringify({ keys: maskedKeys }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("manage-ai-keys error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
