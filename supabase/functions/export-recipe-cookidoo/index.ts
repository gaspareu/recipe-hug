/** Recette classique → adaptation privée persistée → confirmation → envoi relu. */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { corsHeaders } from "../_shared/cors.ts";
import { decryptValue } from "../_shared/decrypt-keys.ts";
import {
  captureEdgeException,
  initializeEdgeErrorMonitoring,
} from "../_shared/error-monitoring.ts";
import { countryToLang, login } from "../_shared/cookidoo/auth.ts";
import {
  type ClientCtx,
  CookidooHttpError,
  createRecipe,
  deleteRecipe,
  fillRecipe,
  findUnguidedSteps,
  getRecipe,
  recipeWebUrl,
  renameRecipe,
  sleep,
  uploadRecipeImage,
} from "../_shared/cookidoo/client.ts";
import { ADAPTATION_JSON_SCHEMA, ADAPTATION_REPAIR_JSON_SCHEMA } from "../_shared/cookidoo/adaptation-format.ts";
import { mapRecipeToCookidoo } from "../_shared/cookidoo/mapper.ts";
import { validateCookidooPayload } from "../_shared/cookidoo/validate.ts";
import { buildExportDiagnostics } from "../_shared/cookidoo/diagnostics.ts";
import {
  type CookidooOps,
  PartialCreateError,
  runExport,
} from "../_shared/cookidoo/run-export.ts";
import type {
  CookidooRecipePayload,
  Recipe,
} from "../_shared/cookidoo/types.ts";
import { resolveAIConfig } from "../_shared/ai-config.ts";
import { callAINonStreaming } from "../_shared/ai-providers.ts";
import {
  adaptationFailureDiagnostic,
  type AdaptationStage,
} from "../_shared/cookidoo/adaptation-diagnostics.ts";
import { generateAdaptation, ADAPTATION_TIMEOUT_MS } from "../_shared/cookidoo/adaptation-generation.ts";
import { ExportSourceSchema } from "../_shared/cookidoo/preparation.ts";
import {
  ADAPTER_VERSION,
  remoteFingerprint,
  signConfirmation,
  sourceFingerprint,
  verifyConfirmation,
} from "../_shared/cookidoo/adaptation.ts";
import { boundedCookidooFetch } from "../_shared/cookidoo/operation.ts";
import { verifyReadback } from "../_shared/cookidoo/readback.ts";

initializeEdgeErrorMonitoring();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
const fail = (error: string) => json({ ok: false, error });
/** Une tentative échouée ne conserve jamais l'aperçu ni les questions précédents. */
function failedPreparation(code: string, blockers: string[] = []) {
  return { status: "failed" as const, error_code: code, adapted_recipe: null,
    changes: [], notes: [], blockers, updated_at: new Date().toISOString() };
}
const ops: CookidooOps = {
  getRecipe,
  createRecipe,
  fillRecipe,
  renameRecipe,
  deleteRecipe,
  uploadRecipeImage,
  findUnguidedSteps,
  recipeWebUrl,
};
function background(work: Promise<void>) {
  // @ts-expect-error — fourni par Supabase, absent des types Deno.
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
}
interface AdaptationRow {
  id: string;
  user_id: string;
  recipe_id: string;
  source_fingerprint: string;
  adapter_version: string;
  status: "preparing" | "ready" | "needs_input" | "failed";
  adapted_recipe: Recipe | null;
  changes: string[];
  notes: string[];
  blockers: string[];
  error_code: string | null;
  updated_at: string;
  lease_until: string;
  attempt_id: string;
  request_context: { technical_water_ml?: number; clarifications?: string[] };
}
interface Job {
  id: string;
  status: "pending" | "success" | "failed" | "unknown";
  phase: string;
  created_at: string;
  cookidoo_recipe_id: string | null;
  expected_payload: CookidooRecipePayload | null;
  [key: string]: unknown;
}
function errorCode(error: unknown): string {
  if (error instanceof PartialCreateError) return "partial_created";
  const message = error instanceof Error ? error.message : "";
  if (
    ["remote_changed", "destination_missing", "creation_unknown"].includes(
      message,
    )
  ) return message;
  if (
    /cookies manquants|Auth échouée|requestId introuvable|login inaccessible/i
      .test(message)
  ) return "auth_failed";
  if (error instanceof CookidooHttpError && error.status === 429) {
    return "rate_limited";
  }
  if (error instanceof CookidooHttpError && error.status === 403) {
    return "ip_blocked";
  }
  return "export_failed";
}
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method === "GET") {
    return json({ capabilities: ["cookidoo_adaptation_v2"] });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return json({ error: "unauthorized" }, 401);
    }
    const url = Deno.env.get("SUPABASE_URL"),
      anon = Deno.env.get("SUPABASE_ANON_KEY"),
      key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      secret = Deno.env.get("AI_KEYS_ENCRYPTION_SECRET");
    if (!url || !anon || !key || !secret) return fail("service_unavailable");
    const client = createClient(url, anon, {
      global: { headers: { Authorization: auth } },
    });
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return json({ error: "unauthorized" }, 401);
    const raw = await req.text();
    if (raw.length > 20000) return fail("invalid_input");
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (!body || Array.isArray(body) || typeof body !== "object") {
      return fail("invalid_input");
    }
    const action = body.action;
    if (
      !["prepare", "status", "send", "check", "acknowledge_absent"].includes(
        String(action),
      )
    ) return fail("preparation_required");
    const recipeId = body.recipe_id;
    if (typeof recipeId !== "string" || !/^[-a-f0-9]{36}$/i.test(recipeId)) {
      return fail("invalid_input");
    }
    const { data: row, error: sourceError } = await client.from("recipes")
      .select(
        "id,user_id,title,servings,ingredients,steps,source_image_url,cookidoo_recipe_id,cookidoo_remote_fingerprint,updated_at",
      ).eq("id", recipeId).eq("user_id", user.id).maybeSingle();
    if (sourceError) return fail("service_unavailable");
    if (!row) return fail("not_found");
    const source: Recipe = {
      title: row.title,
      servings: row.servings,
      ingredients: row.ingredients,
      steps: row.steps,
    };
    if (
      !ExportSourceSchema.safeParse(source).success ||
      JSON.stringify(source).length > 100000
    ) return fail("invalid_source");
    const hash = await sourceFingerprint(source);
    const { data: latestJob, error: jobError } = await admin.from(
      "cookidoo_exports",
    ).select("*").eq("recipe_id", recipeId).eq("user_id", user.id).order(
      "created_at",
      { ascending: false },
    ).limit(1).maybeSingle();
    if (jobError) return fail("service_unavailable");
    const { data: activeJob, error: activeError } = await admin.from(
      "cookidoo_exports",
    ).select("*").eq("recipe_id", recipeId).eq("user_id", user.id).in(
      "status",
      ["pending", "unknown"],
    ).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (activeError) return fail("service_unavailable");
    // Un délai d'attente n'autorise jamais une nouvelle création à l'aveugle.
    let job = (activeJob ?? latestJob) as Job | null;
    if (
      job?.status === "pending" &&
      Date.now() - Date.parse(job.created_at) > 180000
    ) {
      const { error } = await admin.from("cookidoo_exports").update({
        status: "unknown",
        error_code: "result_unknown",
      }).eq("id", job.id).eq("status", "pending");
      if (error) return fail("service_unavailable");
      job = { ...job, status: "unknown" };
    }
    const safeJob = (value: Job | null) =>
      value
        ? {
          id: value.id,
          status: value.status,
          phase: value.phase,
          adaptation_id: value.adaptation_id,
          cookidoo_recipe_id: value.cookidoo_recipe_id,
          cookidoo_url: value.cookidoo_url,
          updated: value.updated,
          warnings: value.warnings,
          unguided_steps: value.unguided_steps,
          error_code: value.error_code,
        }
        : null;
    const { data: existingAdaptation, error: adaptationError } = await admin
      .from(
        "recipe_cookidoo_adaptations",
      ).select("*").eq("user_id", user.id).eq("recipe_id", recipeId).eq(
        "source_fingerprint",
        hash,
      ).eq("adapter_version", ADAPTER_VERSION).maybeSingle();
    if (adaptationError) return fail("service_unavailable");
    let stored = existingAdaptation;
    if (
      stored?.status === "preparing" &&
      Date.parse(stored.lease_until) < Date.now()
    ) {
      const expired = failedPreparation("adaptation_failed", ["L’adaptation a expiré. Vous pouvez la relancer ; aucun envoi n’a été effectué."]);
      const { error } = await admin.from("recipe_cookidoo_adaptations").update(expired).eq("id", stored.id).eq("attempt_id", stored.attempt_id).eq(
        "status",
        "preparing",
      );
      if (error) return fail("service_unavailable");
      stored = { ...stored, ...expired };
    }
    async function preview(value: AdaptationRow | null, reused = true) {
      if (!value) return { ok: true, adaptation: null, job: safeJob(job) };
      const binding = {
        userId: user!.id,
        recipeId: recipeId as string,
        adaptationId: value.id,
        revision: row!.updated_at,
        adaptationRevision: value.updated_at,
      };
      const recipe = value.adapted_recipe
        ? { ...value.adapted_recipe, title: row!.title }
        : null;
      const payload = recipe ? mapRecipeToCookidoo(recipe) : null;
      return {
        ok: true,
        adaptation: {
          id: value.id,
          status: value.status,
          changes: value.changes,
          notes: value.notes,
          blockers: value.blockers,
          error_code: value.error_code,
          reused,
          request_context: value.request_context,
          recipe: recipe
            ? {
              ...recipe,
              steps: recipe.steps.map((s, i) => ({
                ...s,
                text: payload!.instructions[i].text,
              })),
            }
            : null,
          ingredients: payload?.ingredients.map((i) => i.text) ?? [],
          guided_steps: payload?.instructions.filter((s) =>
            s.annotations.some((a) =>
              a.type !== "INGREDIENT"
            )
          ).length ?? 0,
          confirmation: value.status === "ready"
            ? await signConfirmation(binding, secret!)
            : null,
        },
        job: safeJob(job),
        has_destination: !!row!.cookidoo_recipe_id,
      };
    }
    if (action === "status") {
      return json(await preview(stored as AdaptationRow | null));
    }
    if (action === "prepare") {
      const water = body.technical_water_ml;
      const clarifications = body.clarifications;
      if (
        water !== undefined &&
        (typeof water !== "number" || !Number.isInteger(water) || water < 100 ||
          water > 2000)
      ) return fail("invalid_water");
      if (
        clarifications !== undefined &&
        (typeof clarifications !== "string" || clarifications.length > 2000)
      ) return fail("invalid_input");
      const { data: claim, error } = await admin.rpc(
        "claim_cookidoo_adaptation",
        {
          p_user_id: user.id,
          p_recipe_id: recipeId,
          p_fingerprint: hash,
          p_version: ADAPTER_VERSION,
          p_retry: water !== undefined || !!clarifications,
          p_context: {
            ...(water !== undefined ? { technical_water_ml: water } : {}),
            ...(clarifications ? { clarifications: [clarifications] } : {}),
          },
        },
      );
      if (error || !claim?.adaptation) return fail("service_unavailable");
      stored = claim.adaptation;
      const adaptation = stored as AdaptationRow;
      const effectiveWater = adaptation.request_context.technical_water_ml;
      const effectiveClarifications = adaptation.request_context.clarifications;
      if (claim.acquired) {
        background((async () => {
          const startedAt = Date.now();
          let stage: AdaptationStage = "quota";
          const logContext = {
            attempt_id: adaptation.attempt_id,
            adapter_version: ADAPTER_VERSION,
          };
          console.info(
            "[cookidoo-adaptation]",
            JSON.stringify({ event: "started", ...logContext }),
          );
          try {
            const { data: allowed, error: quotaError } = await admin.rpc(
              "consume_cookidoo_preparation_quota",
              { p_user_id: user.id },
            );
            if (quotaError || allowed !== true) {
              throw new Error(
                quotaError ? "service_unavailable" : "preparation_rate_limited",
              );
            }
            stage = "configuration";
            const config = await resolveAIConfig(client, user.id, {
              agentType: "cookidoo_export",
              defaultModel: "claude-sonnet-5-5",
            });
            const candidate = await generateAdaptation({
              source,
              technicalWaterMl: effectiveWater,
              clarifications: effectiveClarifications,
              signal: AbortSignal.timeout(ADAPTATION_TIMEOUT_MS),
              generate: (messages, signal, phase) =>
                callAINonStreaming(config, messages, signal, { jsonSchema: phase === "repair" ? ADAPTATION_REPAIR_JSON_SCHEMA : ADAPTATION_JSON_SCHEMA }),
              onEvent: (event) => {
                stage = event.event === "generation"
                  ? "generation"
                  : "validation";
                console.info(
                  "[cookidoo-adaptation]",
                  JSON.stringify({
                    ...logContext,
                    ...event,
                    duration_ms: Date.now() - startedAt,
                  }),
                );
              },
            });
            stage = "persistence";
            const { error: writeError } = await admin.from(
              "recipe_cookidoo_adaptations",
            ).update({
              status: candidate.status,
              error_code: candidate.status === "failed" ? "adaptation_failed" : null,
              adapted_recipe: candidate.recipe,
              changes: candidate.changes,
              notes: candidate.notes,
              blockers: candidate.blockers,
              updated_at: new Date().toISOString(),
            }).eq("id", adaptation.id).eq("attempt_id", adaptation.attempt_id)
              .eq("status", "preparing");
            if (writeError) throw new Error("service_unavailable");
            console.info(
              "[cookidoo-adaptation]",
              JSON.stringify({
                event: "completed",
                ...logContext,
                status: candidate.status,
                duration_ms: Date.now() - startedAt,
              }),
            );
          } catch (error) {
            const code = error instanceof Error &&
                ["preparation_rate_limited", "service_unavailable"].includes(
                  error.message,
                )
              ? error.message
              : "adaptation_failed";
            const diagnostic = adaptationFailureDiagnostic(error, stage);
            console.error(
              "[cookidoo-adaptation]",
              JSON.stringify({
                event: "failed",
                ...logContext,
                error_code: code,
                duration_ms: Date.now() - startedAt,
                ...diagnostic,
              }),
            );
            await captureEdgeException(
              "export-recipe-cookidoo",
              `${code}:${stage}:${diagnostic.reason}`,
            );
            const { error: writeError } = await admin.from(
              "recipe_cookidoo_adaptations",
            ).update(failedPreparation(code,
              error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)
                ? ["Le service d’adaptation n’a pas terminé dans le délai prévu. Aucun envoi n’a été effectué."]
                : diagnostic.reason === "provider_http_error"
                ? ["Le service d’adaptation est momentanément indisponible. Vous pouvez réessayer sans ajouter de précision."]
                : []
            )).eq("id", adaptation.id).eq("attempt_id", adaptation.attempt_id)
              .eq("status", "preparing");
            if (writeError) {
              console.error(
                "[cookidoo-adaptation]",
                JSON.stringify({
                  event: "failure_journal_failed",
                  ...logContext,
                  duration_ms: Date.now() - startedAt,
                }),
              );
              await captureEdgeException(
                "export-recipe-cookidoo",
                "adaptation_journal_failed",
              );
            }
          }
        })());
      }
      return json(await preview(adaptation, !claim.acquired));
    }
    if (action === "acknowledge_absent") {
      if (
        !job || job.status !== "unknown" || body.confirmed_absent !== true
      ) return fail("result_unknown");
      const { error } = await admin.from("cookidoo_exports").update({
        status: "failed",
        error_code: "absence_confirmed",
        finished_at: new Date().toISOString(),
      }).eq("id", job.id).eq("status", "unknown");
      if (error) return fail("service_unavailable");
      return json({ ok: true });
    }
    const { data: creds, error: credsError } = await client.from(
      "user_cookidoo_credentials",
    ).select("email,password_enc,country").eq("user_id", user.id).maybeSingle();
    if (credsError) return fail("service_unavailable");
    if (!creds) return fail("not_configured");
    let password: string;
    try {
      password = await decryptValue(creds.password_enc, secret);
    } catch {
      return fail("decrypt_failed");
    }
    const lang = countryToLang(creds.country ?? "fr");
    async function context(jobId?: string): Promise<ClientCtx> {
      const fetchImpl = boundedCookidooFetch(
        fetch,
        Date.now() + 90_000,
        jobId
          ? async () => {
            const { data, error } = await admin.from("cookidoo_exports").select(
              "status",
            ).eq("id", jobId).eq("user_id", user!.id).single();
            if (error || data?.status !== "pending") {
              throw new Error("reservation_lost");
            }
          }
          : undefined,
      );
      const jar = await login(creds!.email, password, lang, fetchImpl);
      return {
        cookieHeader: jar.headerForUrl("https://cookidoo.fr"),
        lang,
        fetchImpl,
      };
    }
    if (action === "check") {
      if (
        !job || job.status !== "unknown" || !job.cookidoo_recipe_id ||
        !job.expected_payload
      ) return fail("result_unknown");
      try {
        const ctx = await context();
        const remote = await getRecipe(ctx, job.cookidoo_recipe_id);
        const warnings = verifyReadback(job.expected_payload, remote);
        if (warnings.length) return fail("result_unknown");
        const expected = job.expected_payload.instructions.flatMap((s, i) =>
          s.annotations.some((a) => a.type !== "INGREDIENT") ? [i] : []
        );
        const unguided = expected.length
          ? await findUnguidedSteps(ctx, job.cookidoo_recipe_id, expected, job.expected_payload.instructions)
          : [];
        const { error } = await admin.from("cookidoo_exports").update({
          status: "success",
          phase: "done",
          warnings: unguided.length ? ["steps_not_guided"] : [],
          unguided_steps: unguided,
          cookidoo_url: recipeWebUrl(ctx, job.cookidoo_recipe_id),
          finished_at: new Date().toISOString(),
        }).eq("id", job.id).eq("status", "unknown");
        if (error) return fail("service_unavailable");
        const { error: mapError } = await admin.from("recipes").update({
          cookidoo_remote_fingerprint: await remoteFingerprint(remote),
          cookidoo_exported_at: new Date().toISOString(),
        }).eq("id", recipeId).eq("user_id", user.id);
        if (mapError) return fail("service_unavailable");
        return json({ ok: true });
      } catch {
        return fail("result_unknown");
      }
    }
    const adaptation = stored as AdaptationRow | null;
    if (
      !adaptation || body.adaptation_id !== adaptation.id ||
      adaptation.status !== "ready" || !adaptation.adapted_recipe
    ) return fail("source_changed");
    const binding = {
      userId: user.id,
      recipeId,
      adaptationId: adaptation.id,
      revision: row.updated_at,
      adaptationRevision: adaptation.updated_at,
    };
    if (
      !await verifyConfirmation(body.confirmation, binding, secret)
    ) return fail("preview_expired");
    const recipe = { ...adaptation.adapted_recipe, title: row.title };
    const payload = mapRecipeToCookidoo(recipe);
    if (!validateCookidooPayload(payload).ok) return fail("invalid_payload");
    const { data: reservation, error: reserveError } = await admin.rpc(
      "begin_cookidoo_export",
      {
        p_user_id: user.id,
        p_recipe_id: recipeId,
        p_adaptation_id: adaptation.id,
        p_revision: row.updated_at,
        p_payload: payload,
        p_diagnostics: buildExportDiagnostics(recipe, payload),
      },
    );
    if (reserveError) return fail("service_unavailable");
    if (reservation?.error) return fail(reservation.error);
    const reserved = reservation?.job as Job | undefined;
    if (!reserved) return fail("service_unavailable");
    if (!reservation.acquired) {
      return json({
        ok: true,
        export_id: reserved.id,
        status: reserved.status,
      });
    }
    const started = Date.now();
    background((async () => {
      let destination: string | null = null;
      try {
        const ctx = await context(reserved.id);
        const outcome = await runExport(
          {
            ctx,
            payload,
            existingId: row.cookidoo_recipe_id,
            imageUrl: row.source_image_url ?? undefined,
            supabaseHost: new URL(url).hostname,
            allowRecreate: body.recreate_remote === true,
            beforeUpdate: async (remote) => {
              if (
                row.cookidoo_remote_fingerprint &&
                body.replace_remote !== true &&
                await remoteFingerprint(remote) !==
                  row.cookidoo_remote_fingerprint
              ) throw new Error("remote_changed");
            },
            onDestination: async (id) => {
              destination = id;
              const { error: mapError } = await admin.from("recipes").update({
                cookidoo_recipe_id: id,
              }).eq("id", recipeId).eq("user_id", user.id);
              const { error: journalError } = await admin.from(
                "cookidoo_exports",
              ).update({
                cookidoo_recipe_id: id,
                cookidoo_url: recipeWebUrl(ctx, id),
              }).eq("id", reserved.id);
              if (mapError || journalError) {
                throw new Error("destination_save_failed");
              }
            },
            onVerifying: async () => {
              const { error } = await admin.from("cookidoo_exports").update({
                phase: "verifying",
              }).eq("id", reserved.id);
              if (error) throw new Error("journal_failed");
            },
          },
          ops,
          sleep,
        );
        let remoteHash: string | null = null;
        try {
          remoteHash = await remoteFingerprint(
            await getRecipe(ctx, outcome.cookidoo_recipe_id),
          );
        } catch {
          /* La relecture de runExport a déjà produit un avertissement. */
        }
        const { error: mapError } = await admin.from("recipes").update({
          cookidoo_recipe_id: outcome.cookidoo_recipe_id,
          cookidoo_remote_fingerprint: remoteHash,
          cookidoo_exported_at: new Date().toISOString(),
        }).eq("id", recipeId).eq("user_id", user.id);
        if (mapError) {
          throw new Error("destination_save_failed");
        }
        const { error } = await admin.from("cookidoo_exports").update({
          status: "success",
          phase: "done",
          cookidoo_recipe_id: outcome.cookidoo_recipe_id,
          cookidoo_url: outcome.url,
          updated: outcome.updated,
          warnings: outcome.warnings,
          unguided_steps: outcome.unguided_steps,
          duration_ms: Date.now() - started,
          finished_at: new Date().toISOString(),
        }).eq("id", reserved.id);
        if (error) throw new Error("journal_failed");
      } catch (error) {
        const code = errorCode(error);
        // Après une écriture distante possible, ne pas promettre qu'il n'y a eu aucun envoi.
        const unknown = code === "creation_unknown" ||
          (destination !== null && code !== "partial_created");
        await captureEdgeException("export-recipe-cookidoo", code);
        const { error: writeError } = await admin.from("cookidoo_exports")
          .update({
            status: unknown ? "unknown" : "failed",
            error_code: code,
            cookidoo_recipe_id: error instanceof PartialCreateError
              ? error.cookidooRecipeId
              : destination,
            duration_ms: Date.now() - started,
            finished_at: new Date().toISOString(),
          }).eq("id", reserved.id);
        if (writeError) {
          await captureEdgeException(
            "export-recipe-cookidoo",
            "export_journal_failed",
          );
        }
      }
    })());
    return json({ ok: true, export_id: reserved.id, status: "pending" });
  } catch {
    await captureEdgeException("export-recipe-cookidoo", "request_failed");
    return fail("service_unavailable");
  }
});
