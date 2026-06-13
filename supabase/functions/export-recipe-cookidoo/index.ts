// Export d'une recette recipe-hug vers le compte Cookidoo de l'utilisateur (Thermomix).
//
// Flux : auth Bearer → lecture recette (RLS) → déchiffrement des identifiants Cookidoo
//        → login (cookies) → mapping → create → patch → URL de la recette créée.
//
// ⚠️ Faisabilité : Cookidoo bloque possiblement les IP datacenter. Les erreurs sont
// classifiées (auth_failed / ip_blocked / rate_limited) pour trancher le go/no-go
// dès le premier export réel. Si ip_blocked, le CLI local (connector/cookidoo) reste
// le plan B — il partage exactement les mêmes modules _shared/cookidoo.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { corsHeaders } from "../_shared/cors.ts";
import { decryptValue } from "../_shared/decrypt-keys.ts";
import { login, countryToLang } from "../_shared/cookidoo/auth.ts";
import {
  createRecipe,
  fillRecipe,
  recipeWebUrl,
  type ClientCtx,
} from "../_shared/cookidoo/client.ts";
import { mapRecipeToCookidoo } from "../_shared/cookidoo/mapper.ts";
import type { Recipe, ThermomixTool } from "../_shared/cookidoo/types.ts";

const VALID_TOOLS: ThermomixTool[] = ["TM7", "TM6", "TM5", "TM31"];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Échec « métier » : renvoyé en HTTP 200 avec ok:false pour que le client lise
// systématiquement le corps via response.data (supabase-js met data à null sur non-2xx).
function fail(error: string, message: string): Response {
  return json({ ok: false, error, message }, 200);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Classe une erreur réseau/Cookidoo pour orienter le diagnostic côté UI. */
function classifyError(err: unknown): { error: string; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  // Auth : cookies de session non obtenus (mauvais identifiants ou flow login modifié)
  if (/cookies manquants|Auth échouée|requestId introuvable|login inaccessible/i.test(msg)) {
    return { error: "auth_failed", message: msg };
  }
  // Rate limit Cookidoo (~10 req/min)
  if (/HTTP 429/.test(msg)) {
    return { error: "rate_limited", message: msg };
  }
  // Blocage probable de l'IP datacenter (403 / Forbidden / Akamai / échec fetch réseau)
  if (/HTTP 403|forbidden|akamai|access denied|blocked/i.test(msg) ||
      /fetch failed|error sending request|connection|dns|timeout/i.test(msg)) {
    return { error: "ip_blocked", message: msg };
  }
  return { error: "export_failed", message: msg };
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

    // ── Validation de l'entrée ─────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const recipeId = typeof body.recipe_id === "string" ? body.recipe_id : "";
    if (!recipeId) {
      return fail("invalid_input", "recipe_id requis");
    }
    let tools: ThermomixTool[] = ["TM7"];
    if (Array.isArray(body.tools)) {
      const filtered = body.tools.filter((t: unknown): t is ThermomixTool =>
        typeof t === "string" && VALID_TOOLS.includes(t as ThermomixTool));
      if (filtered.length > 0) tools = filtered;
    }

    // ── Lecture de la recette (RLS : propriété garantie côté DB) ────────────
    const { data: recipeRow, error: recipeError } = await supabase
      .from("recipes")
      .select("title, servings, ingredients, steps")
      .eq("id", recipeId)
      .maybeSingle();
    if (recipeError) return json({ error: "db_error", message: recipeError.message }, 500);
    if (!recipeRow) return fail("not_found", "Recette introuvable");

    // ── Lecture + déchiffrement des identifiants Cookidoo ──────────────────
    const { data: creds, error: credsError } = await supabase
      .from("user_cookidoo_credentials")
      .select("email, password_enc, country")
      .eq("user_id", user.id)
      .maybeSingle();
    if (credsError) return json({ error: "db_error", message: credsError.message }, 500);
    if (!creds) {
      return fail("not_configured", "Identifiants Cookidoo non configurés (Profil → Cookidoo).");
    }
    if (!ENCRYPTION_SECRET) {
      return json({ error: "server_misconfigured", message: "AI_KEYS_ENCRYPTION_SECRET absent" }, 500);
    }

    let password: string;
    try {
      password = await decryptValue(creds.password_enc, ENCRYPTION_SECRET);
    } catch {
      return fail("decrypt_failed", "Impossible de déchiffrer le mot de passe Cookidoo. Reconfigurez-le.");
    }

    const lang = countryToLang(creds.country ?? "fr");
    const recipe: Recipe = {
      title: recipeRow.title,
      servings: recipeRow.servings,
      ingredients: (recipeRow.ingredients ?? []) as Recipe["ingredients"],
      steps: (recipeRow.steps ?? []) as Recipe["steps"],
    };
    const payload = mapRecipeToCookidoo(recipe, { tools });

    // ── Auth + upload Cookidoo (zone à risque IP) ──────────────────────────
    try {
      const jar = await login(creds.email, password, lang);
      const ctx: ClientCtx = { cookieHeader: jar.headerForUrl("https://cookidoo.fr"), lang };

      const id = await createRecipe(ctx, payload.name);
      await sleep(5000); // Cookidoo exige un délai avant les PATCH de remplissage
      await fillRecipe(ctx, id, payload);

      return json({
        ok: true,
        cookidoo_recipe_id: id,
        url: recipeWebUrl(ctx, id),
        tools,
      });
    } catch (err) {
      const classified = classifyError(err);
      console.error("[export-recipe-cookidoo]", classified.error, classified.message);
      return fail(classified.error, classified.message);
    }
  } catch (err) {
    console.error("[export-recipe-cookidoo] fatal", err);
    return json({ error: "internal_error", message: String(err) }, 500);
  }
});
