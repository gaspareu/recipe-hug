// Gestion des identifiants Cookidoo de l'utilisateur (email + mot de passe + pays).
// Le mot de passe est chiffré (AES-GCM) avant stockage et jamais renvoyé en clair.
//   GET    → statut de configuration (email masqué, pays) ou { configured: false }
//   POST   → upsert { email, password, country } (password chiffré)
//   DELETE → supprime les identifiants
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { encryptValue, maskApiKey } from "../_shared/decrypt-keys.ts";
import { corsHeaders } from "../_shared/cors.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "unauthorized", message: "Authentication required" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const ENCRYPTION_SECRET = Deno.env.get("AI_KEYS_ENCRYPTION_SECRET");
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Missing required environment variables");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return json({ error: "unauthorized", message: "Invalid token" }, 401);
    }

    // ── GET : statut de configuration ──────────────────────────────────────
    if (req.method === "GET") {
      const { data } = await supabase
        .from("user_cookidoo_credentials_safe")
        .select("email, country, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!data) return json({ configured: false });
      return json({
        configured: true,
        email_masked: maskApiKey(data.email),
        country: data.country,
        updated_at: data.updated_at,
      });
    }

    // ── POST : upsert des identifiants ─────────────────────────────────────
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const email = typeof body.email === "string" ? body.email.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      const country = typeof body.country === "string" && body.country.trim()
        ? body.country.trim().toLowerCase()
        : "fr";

      if (!email || !password) {
        return json({ error: "invalid_input", message: "email et password requis" }, 400);
      }
      if (!ENCRYPTION_SECRET) {
        return json(
          { error: "server_misconfigured", message: "AI_KEYS_ENCRYPTION_SECRET absent" },
          500,
        );
      }

      const password_enc = await encryptValue(password, ENCRYPTION_SECRET);

      const { error } = await supabase
        .from("user_cookidoo_credentials")
        .upsert(
          { user_id: user.id, email, password_enc, country, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );

      if (error) return json({ error: "db_error", message: error.message }, 500);
      return json({ configured: true, email_masked: maskApiKey(email), country });
    }

    // ── DELETE : suppression ───────────────────────────────────────────────
    if (req.method === "DELETE") {
      const { error } = await supabase
        .from("user_cookidoo_credentials")
        .delete()
        .eq("user_id", user.id);
      if (error) return json({ error: "db_error", message: error.message }, 500);
      return json({ configured: false });
    }

    return json({ error: "method_not_allowed" }, 405);
  } catch (err) {
    console.error("[manage-cookidoo-credentials]", err);
    return json({ error: "internal_error", message: String(err) }, 500);
  }
});
