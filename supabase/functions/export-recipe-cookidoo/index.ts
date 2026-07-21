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
  deleteRecipe,
  fillRecipe,
  findUnguidedSteps,
  getRecipe,
  recipeWebUrl,
  renameRecipe,
  sleep,
  uploadRecipeImage,
  type ClientCtx,
} from "../_shared/cookidoo/client.ts";
import { mapRecipeToCookidoo } from "../_shared/cookidoo/mapper.ts";
import { validateCookidooPayload } from "../_shared/cookidoo/validate.ts";
import { buildExportDiagnostics } from "../_shared/cookidoo/diagnostics.ts";
import { PartialCreateError, runExport, type CookidooOps } from "../_shared/cookidoo/run-export.ts";
import type { Recipe, ThermomixTool } from "../_shared/cookidoo/types.ts";

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

/** Implémentation réelle des opérations Cookidoo injectées dans `runExport`. */
const realOps: CookidooOps = {
  getRecipe,
  createRecipe,
  fillRecipe,
  renameRecipe,
  deleteRecipe,
  uploadRecipeImage,
  findUnguidedSteps,
  recipeWebUrl,
};

// Le runtime prévient avant de recycler l'isolate. Sans cette trace, un export
// interrompu en plein vol laisse une ligne `pending` sans la moindre indication
// de la cause : on saurait qu'il a échoué, pas pourquoi.
// @ts-ignore — addEventListener("beforeunload") est propre au runtime Supabase.
globalThis.addEventListener?.("beforeunload", (ev: unknown) => {
  const reason = (ev as { detail?: { reason?: string } })?.detail?.reason ?? "inconnu";
  console.error(`[export-recipe-cookidoo] isolate arrêté (${reason}) — export en cours possiblement interrompu`);
});

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
    // Scope mono-appareil : l'export cible toujours le TM7 (cf. type ThermomixTool).
    const tools: ThermomixTool[] = ["TM7"];

    // ── Lecture de la recette (RLS : propriété garantie côté DB) ────────────
    const { data: recipeRow, error: recipeError } = await supabase
      .from("recipes")
      .select("title, servings, ingredients, steps, source_image_url, cookidoo_recipe_id")
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
    // N'extraire que le champ utile : la tâche de fond vit plusieurs secondes,
    // inutile qu'elle retienne toute la ligne d'identifiants (dont le chiffré).
    const { email } = creds;
    const recipe: Recipe = {
      title: recipeRow.title,
      servings: recipeRow.servings,
      ingredients: (recipeRow.ingredients ?? []) as Recipe["ingredients"],
      steps: (recipeRow.steps ?? []) as Recipe["steps"],
    };
    const imageUrl =
      typeof recipeRow.source_image_url === "string" && recipeRow.source_image_url.trim()
        ? recipeRow.source_image_url.trim()
        : undefined;
    const payload = mapRecipeToCookidoo(recipe, { tools });

    // ── Validation avant tout appel réseau ─────────────────────────────────
    // Échoue tôt et clairement, sans consommer d'authentification ni de budget
    // de requêtes (rate limit Cookidoo ~10/min).
    const validation = validateCookidooPayload(payload);
    if (!validation.ok) {
      return fail("invalid_payload", `Recette non exportable : ${validation.errors.join(", ")}.`);
    }

    // ── Anti-doublon : identifiant Cookidoo déjà associé à cette recette ? ──
    const rawExistingId = (recipeRow as { cookidoo_recipe_id?: unknown }).cookidoo_recipe_id;
    const existingId =
      typeof rawExistingId === "string" && rawExistingId.trim() ? rawExistingId.trim() : null;

    // ── Journal : ligne pending, créée avant de rendre la main ──────────────
    // Écriture en service role : la RLS n'accorde au client que la lecture, de
    // sorte qu'un journal ne puisse pas être falsifié depuis le front.
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SERVICE_ROLE_KEY) {
      return json({ error: "server_misconfigured", message: "SUPABASE_SERVICE_ROLE_KEY absent" }, 500);
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const diagnostics = buildExportDiagnostics(recipe, payload);
    const { data: job, error: jobError } = await admin
      .from("cookidoo_exports")
      .insert({ user_id: user.id, recipe_id: recipeId, diagnostics })
      .select("id")
      .single();
    if (jobError || !job) {
      return json({ error: "db_error", message: jobError?.message ?? "job non créé" }, 500);
    }

    // ── Phase asynchrone ───────────────────────────────────────────────────
    // Tout ce qui suit se poursuit après la réponse HTTP. Aucune exception ne
    // doit s'en échapper : elle serait perdue sans laisser de trace, et la
    // ligne resterait pending indéfiniment.
    const startedAt = Date.now();
    const work = (async () => {
      try {
        const jar = await login(email, password, lang);
        const ctx: ClientCtx = { cookieHeader: jar.headerForUrl("https://cookidoo.fr"), lang };

        const outcome = await runExport(
          { ctx, payload, existingId, imageUrl, supabaseHost: new URL(SUPABASE_URL).hostname },
          realOps,
          sleep,
        );

        // Deux écritures indépendantes (tables différentes, aucune dépendance de
        // données) : les lancer ensemble évite un aller-retour de latence avant
        // que la ligne passe en `success` — donc avant que le front cesse d'interroger.
        // supabase-js ne lève pas sur erreur d'écriture : chaque erreur est donc
        // journalisée explicitement (règle « pas d'échec silencieux »). Sans le
        // contrôle sur le second update, la ligne resterait bloquée en `pending`.
        const [{ error: mapErr }, { error: successErr }] = await Promise.all([
          // Mémorise le mapping pour le prochain export (anti-doublon).
          admin
            .from("recipes")
            .update({
              cookidoo_recipe_id: outcome.cookidoo_recipe_id,
              cookidoo_exported_at: new Date().toISOString(),
            })
            .eq("id", recipeId),
          admin.from("cookidoo_exports").update({
            status: "success",
            cookidoo_recipe_id: outcome.cookidoo_recipe_id,
            cookidoo_url: outcome.url,
            updated: outcome.updated,
            warnings: outcome.warnings,
            unguided_steps: outcome.unguided_steps,
            duration_ms: Date.now() - startedAt,
            finished_at: new Date().toISOString(),
          }).eq("id", job.id),
        ]);
        if (mapErr) console.error("[export-recipe-cookidoo] mapping", mapErr.message);
        if (successErr) {
          console.error("[export-recipe-cookidoo] journal succès", successErr.message);
        }
      } catch (err) {
        try {
          const classified = err instanceof PartialCreateError
            ? { error: "partial_created", message: err.message }
            : classifyError(err);
          console.error("[export-recipe-cookidoo]", classified.error, classified.message);

          const { error: updateErr } = await admin.from("cookidoo_exports").update({
            status: "failed",
            error_code: classified.error,
            error_message: classified.message,
            // Conserve l'identifiant de la recette résiduelle à nettoyer.
            cookidoo_recipe_id: err instanceof PartialCreateError ? err.cookidooRecipeId : null,
            duration_ms: Date.now() - startedAt,
            finished_at: new Date().toISOString(),
          }).eq("id", job.id);
          // Dernier recours : si même l'écriture de l'échec échoue, la ligne
          // restera pending. Au moins la cause apparaîtra dans les logs.
          if (updateErr) console.error("[export-recipe-cookidoo] journal", updateErr.message);
        } catch (reportErr) {
          // Rien ne doit s'échapper d'une tâche de fond : l'exception serait
          // perdue sans trace et la ligne resterait pending sans explication.
          console.error("[export-recipe-cookidoo] journal (exception)", reportErr);
        }
      }
    })();

    // @ts-ignore — EdgeRuntime est fourni par le runtime Supabase, absent des types Deno.
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);

    return json({ ok: true, export_id: job.id, status: "pending", tools });
  } catch (err) {
    console.error("[export-recipe-cookidoo] fatal", err);
    return json({ error: "internal_error", message: String(err) }, 500);
  }
});
