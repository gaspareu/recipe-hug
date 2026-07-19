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
  CookidooHttpError,
  createRecipe,
  findUnguidedSteps,
  deleteRecipe,
  fillRecipe,
  getRecipe,
  recipeWebUrl,
  renameRecipe,
  uploadRecipeImage,
  type ClientCtx,
} from "../_shared/cookidoo/client.ts";
import { mapRecipeToCookidoo } from "../_shared/cookidoo/mapper.ts";
import { validateCookidooPayload } from "../_shared/cookidoo/validate.ts";
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

    // ── Auth + upload Cookidoo (zone à risque IP) ──────────────────────────
    try {
      const jar = await login(creds.email, password, lang);
      const ctx: ClientCtx = { cookieHeader: jar.headerForUrl("https://cookidoo.fr"), lang };

      // Ré-export : mise à jour en place si la recette existe toujours côté
      // Cookidoo (si elle y a été supprimée, on la recrée).
      let reuseId: string | null = null;
      if (existingId) {
        try {
          await getRecipe(ctx, existingId);
          reuseId = existingId;
        } catch (lookupErr) {
          // 404 → la recette a été supprimée côté Cookidoo : on la recrée.
          // Toute autre erreur (429, 5xx, réseau) : on NE recrée PAS — ce serait
          // fabriquer le doublon que ce mécanisme doit justement éviter.
          if (lookupErr instanceof CookidooHttpError && lookupErr.status === 404) {
            reuseId = null;
          } else {
            throw lookupErr;
          }
        }
      }

      const warnings: string[] = [];
      let id: string;
      if (reuseId) {
        id = reuseId;
        // Le champ de renommage en PATCH n'est pas confirmé (endpoints
        // non-officiels) → best-effort : un échec ne doit pas empêcher la mise à
        // jour du contenu.
        try {
          await renameRecipe(ctx, id, payload.name);
          await sleep(2000);
        } catch (renameErr) {
          console.error("[export-recipe-cookidoo] rename", renameErr);
          warnings.push("title_not_updated");
        }
        await fillRecipe(ctx, id, payload);
      } else {
        id = await createRecipe(ctx, payload.name);
        await sleep(5000); // Cookidoo exige un délai avant les PATCH de remplissage
        try {
          await fillRecipe(ctx, id, payload);
        } catch (fillErr) {
          // Rollback best-effort : ne pas laisser une recette vide sur Cookidoo.
          try {
            await deleteRecipe(ctx, id);
          } catch {
            return fail(
              "partial_created",
              `Recette partiellement créée sur Cookidoo (id ${id}) : le remplissage a échoué et la suppression automatique aussi. Supprimez-la depuis Cookidoo, ou via le CLI (--delete ${id}).`,
            );
          }
          throw fillErr; // rollback OK → échec classé normalement, sans résidu
        }
      }

      // Image : upload Cloudinary isolé, best-effort — un échec n'invalide pas
      // l'export (Cookidoo ré-héberge l'image, cf. uploadRecipeImage).
      if (imageUrl) {
        try {
          await sleep(2000);
          await uploadRecipeImage(ctx, id, imageUrl, new URL(SUPABASE_URL).hostname);
        } catch (imgErr) {
          console.error("[export-recipe-cookidoo] image", imgErr);
          warnings.push("image_not_transferred");
        }
      } else {
        warnings.push("no_image");
      }

      // Contrôle du guided cooking : l'API accepte des annotations qu'elle dégrade
      // ensuite en simple texte, sans erreur HTTP (cf. docs/COOKIDOO-CONTRAT.md §8).
      // La vue « appareil » est le seul endroit où ce silence devient visible.
      const expectedGuided = payload.instructions
        .map((step, i) => (step.annotations.some((a) => a.type !== "INGREDIENT") ? i : -1))
        .filter((i) => i >= 0);
      if (expectedGuided.length > 0) {
        try {
          await sleep(2000);
          const unguided = await findUnguidedSteps(ctx, id, expectedGuided);
          if (unguided.length > 0) {
            console.error(
              `[export-recipe-cookidoo] étapes non guidées sur l'appareil : ${unguided.join(", ")}`,
            );
            warnings.push("steps_not_guided");
          }
        } catch (checkErr) {
          // Contrôle best-effort : son échec ne remet pas en cause l'export.
          console.error("[export-recipe-cookidoo] contrôle guided cooking", checkErr);
        }
      }

      // Mémorise le mapping pour le prochain export (anti-doublon). Non bloquant :
      // si la colonne n'existe pas encore, l'export reste un succès.
      const { error: mapErr } = await supabase
        .from("recipes")
        .update({ cookidoo_recipe_id: id, cookidoo_exported_at: new Date().toISOString() })
        .eq("id", recipeId);
      if (mapErr) console.error("[export-recipe-cookidoo] mapping", mapErr.message);

      return json({
        ok: true,
        cookidoo_recipe_id: id,
        url: recipeWebUrl(ctx, id),
        tools,
        warnings,
        updated: reuseId !== null,
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
