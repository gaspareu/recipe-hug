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
import { captureEdgeException, initializeEdgeErrorMonitoring } from "../_shared/error-monitoring.ts";
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
import { resolveAIConfig } from "../_shared/ai-config.ts";
import { callAINonStreaming } from "../_shared/ai-providers.ts";
import { applyPreparation, ExportSourceSchema, PREPARATION_PROMPT, signPreparation, verifyPreparation } from "../_shared/cookidoo/preparation.ts";
import { exportQualityNotes } from "../_shared/cookidoo/quality.ts";

initializeEdgeErrorMonitoring();

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
globalThis.addEventListener?.("beforeunload", (ev: unknown) => {
  const reason = (ev as { detail?: { reason?: string } })?.detail?.reason ?? "inconnu";
  console.error(`[export-recipe-cookidoo] isolate arrêté (${reason}) — export en cours possiblement interrompu`);
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

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
    const input: unknown = await req.json().catch(() => null);
    if (!input || typeof input !== "object" || Array.isArray(input)) return fail("invalid_input", "Un objet JSON est requis.");
    const body = input as Record<string, unknown>;
    if (body.action !== undefined && body.action !== "prepare") return fail("invalid_input", "Action inconnue.");
    const recipeId = typeof body.recipe_id === "string" ? body.recipe_id : "";
    if (!recipeId || recipeId.length > 100 || JSON.stringify(body).length > 200_000) {
      return fail("invalid_input", "recipe_id requis");
    }
    // Scope mono-appareil : l'export cible toujours le TM7 (cf. type ThermomixTool).
    const tools: ThermomixTool[] = ["TM7"];

    // ── Lecture de la recette (RLS : propriété garantie côté DB) ────────────
    const { data: recipeRow, error: recipeError } = await supabase
      .from("recipes")
      .select("title, servings, ingredients, steps, source_image_url, cookidoo_recipe_id, updated_at")
      .eq("id", recipeId)
      .maybeSingle();
    if (recipeError) return json({ error: "db_error", message: recipeError.message }, 500);
    if (!recipeRow) return fail("not_found", "Recette introuvable");

    const source: Recipe = {
      title: recipeRow.title,
      servings: recipeRow.servings,
      ingredients: (recipeRow.ingredients ?? []) as Recipe["ingredients"],
      steps: (recipeRow.steps ?? []) as Recipe["steps"],
    };
    if (!ExportSourceSchema.safeParse(source).success) return fail("invalid_input", "La recette contient des ingrédients ou étapes incomplets. Corrigez-les avant l’export.");
    if (!ENCRYPTION_SECRET) return fail("server_misconfigured", "Secret de signature absent.");
    if (source.steps.length > 100 || source.ingredients.length > 200 || JSON.stringify(source).length > 100_000) {
      return fail("invalid_input", "Recette trop volumineuse pour cet export.");
    }
    const binding = { userId: user.id, recipeId, revision: recipeRow.updated_at };
    // Préparation sans login Cookidoo, sans journal et sans modification de la source.
    if (body.action === "prepare") {
      try {
        const initialPayload = mapRecipeToCookidoo(source, { tools });
        let candidate = { recipe: source, notes: [] as string[] };
        if (exportQualityNotes(source, initialPayload).some((note) => note.startsWith("Réglages machine absents"))) {
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
          if (!serviceKey) return fail("preparation_unavailable", "Préparation indisponible. Aucun envoi effectué.");
          const quotaClient = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
          const { data: quotaAllowed, error: quotaError } = await quotaClient.rpc("consume_cookidoo_preparation_quota", { p_user_id: user.id });
          if (quotaError || typeof quotaAllowed !== "boolean") return fail("preparation_unavailable", "Le contrôle de quota est indisponible. Aucun envoi effectué.");
          if (!quotaAllowed) return fail("preparation_rate_limited", "Limite de préparation TM7 atteinte (2 par minute, 10 par jour, avec un plafond global). Réessayez plus tard.");
          const config = await resolveAIConfig(supabase, user.id, { agentType: "cookidoo_export", defaultModel: "claude-sonnet-5-5" });
          const output = await callAINonStreaming(config, [
            { role: "system", content: PREPARATION_PROMPT },
            { role: "user", content: JSON.stringify({ ...source, steps: [...source.steps].sort((a, b) => a.order - b.order) }) },
          ], AbortSignal.timeout(45_000));
          candidate = applyPreparation(source, output);
        }
        const mapped = mapRecipeToCookidoo(candidate.recipe, { tools });
        // L'aperçu montre exactement le texte envoyé, y compris les réglages
        // structurés rendus explicites pour éviter les chevauchements.
        candidate.recipe = { ...candidate.recipe, steps: [...candidate.recipe.steps].sort((a, b) => a.order - b.order).map((step, i) => ({ ...step, text: mapped.instructions[i].text })) };
        const validation = validateCookidooPayload(mapped);
        if (!validation.ok) return fail("invalid_payload", validation.errors.join(" ; "));
        candidate.notes = [...new Set([...candidate.notes, ...exportQualityNotes(candidate.recipe, mapped)])];
        const prepared = await signPreparation(candidate, binding, ENCRYPTION_SECRET);
        return json({ ok: true, prepared, ingredients: mapped.ingredients.map((ing) => ing.text), guided_steps: mapped.instructions.filter((s) => s.annotations.some((a) => a.type !== "INGREDIENT")).length });
      } catch {
        await captureEdgeException("export-recipe-cookidoo", "preparation_failed");
        return fail("preparation_failed", "La préparation TM7 a échoué. Réessayez ; aucun envoi n'a été effectué.");
      }
    }
    let recipe = source;
    let preparationNotes: string[] = [];
    if (body.prepared !== undefined) {
      const verified = await verifyPreparation(body.prepared, binding, ENCRYPTION_SECRET);
      if (!verified) return fail("preview_expired", "L'aperçu a expiré ou la recette a changé. Préparez un nouvel aperçu.");
      recipe = verified.recipe;
      preparationNotes = verified.notes;
    } else if (exportQualityNotes(source, mapRecipeToCookidoo(source, { tools })).length) {
      return fail("preparation_required", "Préparez l'aperçu TM7 avant l'envoi pour vérifier les réglages et les mesures.");
    }

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

    const diagnostics = { ...buildExportDiagnostics(recipe, payload), source_steps_with_tm7: source.steps.filter((s) => s.tm7).length, prepared: body.prepared !== undefined };
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
            warnings: [...new Set([...outcome.warnings, ...((preparationNotes.length || exportQualityNotes(recipe, payload).length) ? ["source_needs_review"] : [])])],
            unguided_steps: outcome.unguided_steps,
            duration_ms: Date.now() - startedAt,
            finished_at: new Date().toISOString(),
          }).eq("id", job.id),
        ]);
        if (mapErr) {
          console.error("[export-recipe-cookidoo] mapping", mapErr.message);
          await captureEdgeException("export-recipe-cookidoo", "recipe_mapping_write_failed");
        }
        if (successErr) {
          console.error("[export-recipe-cookidoo] journal succès", successErr.message);
          await captureEdgeException("export-recipe-cookidoo", "success_journal_write_failed");
        }
      } catch (err) {
        try {
          const classified = err instanceof PartialCreateError
            ? { error: "partial_created", message: err.message }
            : classifyError(err);
          console.error("[export-recipe-cookidoo]", classified.error, classified.message);
          await captureEdgeException("export-recipe-cookidoo", classified.error);

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
          if (updateErr) {
            console.error("[export-recipe-cookidoo] journal", updateErr.message);
            await captureEdgeException("export-recipe-cookidoo", "failure_journal_write_failed");
          }
        } catch (reportErr) {
          // Rien ne doit s'échapper d'une tâche de fond : l'exception serait
          // perdue sans trace et la ligne resterait pending sans explication.
          console.error("[export-recipe-cookidoo] journal (exception)", reportErr);
          await captureEdgeException("export-recipe-cookidoo", "failure_journal_exception");
        }
      }
    })();

    // @ts-expect-error — EdgeRuntime est fourni par le runtime Supabase, absent des types Deno.
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);

    return json({ ok: true, export_id: job.id, status: "pending", tools });
  } catch (err) {
    console.error("[export-recipe-cookidoo] fatal", err);
    await captureEdgeException("export-recipe-cookidoo", "fatal_error");
    return json({ error: "internal_error", message: String(err) }, 500);
  }
});
