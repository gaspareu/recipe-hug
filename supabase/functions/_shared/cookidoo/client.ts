/**
 * Client HTTP des endpoints /created-recipes de Cookidoo.
 *
 * Auth par cookies (_oauth2_proxy + v-authenticated) — pas de Bearer token.
 * Base URL : https://cookidoo.fr  (les cookies sont scopés à ce domaine)
 * Séquence d'upload : POST create → attendre ~5 s → PATCH (payload complet).
 * Rate limit observé ~10 req/min — espacer les envois.
 *
 * Résilience : `request()` ré-essaie les 429 (respecte `Retry-After`) et les 5xx
 * (backoff exponentiel), sauf le POST de création sur 5xx (réponse ambiguë →
 * risque de doublon). `fetch`/`sleep` sont injectables (tests) via ClientCtx.
 */
import type { CookidooRecipePayload } from "./types.ts";

const API_BASE = "https://cookidoo.fr";

/**
 * Erreur HTTP Cookidoo, porteuse du statut : permet aux appelants de distinguer
 * un 404 (ressource absente) d'une erreur transitoire (429, 5xx) sans parser le
 * message.
 */
export class CookidooHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "CookidooHttpError";
  }
}

export interface RetryPolicy {
  maxAttempts: number; // nombre total de tentatives (initiale incluse)
  base429Ms: number; // backoff de base sur 429
  base5xxMs: number; // backoff de base sur 5xx
  maxDelayMs: number; // plafond d'un délai unitaire
}

export const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 3,
  base429Ms: 6000, // ~1 req / 6 s pour tenir sous ~10 req/min
  base5xxMs: 2000,
  maxDelayMs: 30000,
};

export interface ClientCtx {
  cookieHeader: string; // cookies sérialisés pour cookidoo.fr
  lang: string; // ex. "fr-FR"
  /** Injectable pour les tests (défaut : fetch global). */
  fetchImpl?: typeof fetch;
  /** Injectable pour les tests (défaut : setTimeout). */
  sleepImpl?: (ms: number) => Promise<void>;
  /** Politique de ré-essai (défaut : DEFAULT_RETRY). */
  retry?: RetryPolicy;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function headers(ctx: ClientCtx): Record<string, string> {
  return {
    Cookie: ctx.cookieHeader,
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-requested-with": "xmlhttprequest",
  };
}

function backoffDelay(status: number, resHeaders: Headers, attempt: number, policy: RetryPolicy): number {
  if (status === 429) {
    const ra = resHeaders.get("retry-after");
    if (ra) {
      const secs = parseInt(ra, 10);
      if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, policy.maxDelayMs);
    }
    return Math.min(policy.base429Ms * 2 ** attempt, policy.maxDelayMs);
  }
  return Math.min(policy.base5xxMs * 2 ** attempt, policy.maxDelayMs);
}

/**
 * Requête HTTP avec ré-essais. `idempotent: false` (POST create) interdit le
 * rejeu sur 5xx (la recette a pu être créée) mais autorise le rejeu sur 429.
 */
async function request<T>(
  ctx: ClientCtx,
  method: string,
  path: string,
  body?: unknown,
  opts: { idempotent?: boolean } = {},
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const doFetch = ctx.fetchImpl ?? fetch;
  const doSleep = ctx.sleepImpl ?? sleep;
  const policy = ctx.retry ?? DEFAULT_RETRY;
  const idempotent = opts.idempotent ?? true;

  let attempt = 0;
  while (true) {
    const res = await doFetch(url, {
      method,
      headers: headers(ctx),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (res.ok) return (text ? JSON.parse(text) : {}) as T;

    const status = res.status;
    const retriable = status === 429 || (status >= 500 && status < 600 && idempotent);
    if (retriable && attempt < policy.maxAttempts - 1) {
      await doSleep(backoffDelay(status, res.headers, attempt, policy));
      attempt++;
      continue;
    }
    throw new CookidooHttpError(
      status,
      `${method} ${path} → HTTP ${status} : ${text.slice(0, 300)}`,
    );
  }
}

/** Crée une recette vide, renvoie son id. Non idempotent (pas de rejeu sur 5xx). */
export async function createRecipe(ctx: ClientCtx, name: string): Promise<string> {
  const data = await request<Record<string, string>>(
    ctx,
    "POST",
    `/created-recipes/${ctx.lang}`,
    { recipeName: name },
    { idempotent: false },
  );
  const id = data.id ?? data.recipeId ?? data._id;
  if (!id) throw new Error(`Création OK mais aucun id renvoyé : ${JSON.stringify(data)}`);
  return id;
}

function patchFields(ctx: ClientCtx, id: string, fields: Record<string, unknown>): Promise<unknown> {
  return request(ctx, "PATCH", `/created-recipes/${ctx.lang}/${id}`, fields);
}

/**
 * Remplit une recette existante avec le payload complet, en plusieurs PATCH successifs
 * (ingrédients, puis étapes, puis métadonnées). Un PATCH unique combinant tous les champs
 * n'est pas appliqué de façon fiable par l'API Cookidoo (observé : ingrédients/étapes
 * absents ou partiels) — on suit ici le découpage utilisé par les clients connus.
 */
export async function fillRecipe(
  ctx: ClientCtx,
  id: string,
  payload: CookidooRecipePayload,
): Promise<void> {
  const doSleep = ctx.sleepImpl ?? sleep;
  await patchFields(ctx, id, { ingredients: payload.ingredients });
  await doSleep(2000);
  await patchFields(ctx, id, { instructions: payload.instructions });
  await doSleep(2000);
  await patchFields(ctx, id, {
    tools: payload.tools,
    yield: payload.yield,
    prepTime: payload.prepTime,
    cookTime: payload.cookTime,
    totalTime: payload.totalTime,
    hints: payload.hints,
    workStatus: payload.workStatus,
    recipeMetadata: payload.recipeMetadata,
  });
}

/** Met à jour le nom d'une recette existante (ré-export « update-in-place »). */
export function renameRecipe(ctx: ClientCtx, id: string, name: string): Promise<unknown> {
  return patchFields(ctx, id, { recipeName: name });
}

/**
 * Associe l'image du plat à une recette (PATCH isolé, best-effort).
 * ⚠️ Endpoints non-officiels : la forme du champ `image` reste à confirmer par
 * le spike (hypothèse actuelle = URL publique directe). Appelé séparément du
 * remplissage pour qu'un échec n'invalide pas le reste de l'export.
 */
export function setRecipeImage(ctx: ClientCtx, id: string, imageUrl: string): Promise<unknown> {
  return patchFields(ctx, id, { image: imageUrl, isImageOwnedByUser: true });
}

export function getRecipe(ctx: ClientCtx, id: string): Promise<unknown> {
  return request(ctx, "GET", `/created-recipes/${ctx.lang}/${id}`);
}

export function deleteRecipe(ctx: ClientCtx, id: string): Promise<unknown> {
  return request(ctx, "DELETE", `/created-recipes/${ctx.lang}/${id}`);
}

/** URL web de la recette créée (consultable dans un navigateur). */
export function recipeWebUrl(ctx: ClientCtx, id: string): string {
  return `${API_BASE}/created-recipes/${ctx.lang}/${id}`;
}
