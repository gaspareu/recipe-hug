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

/** Pause simple. Exportée : l'edge function s'en sert pour cadencer l'export. */
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Vue « complète » d'une recette créée. **Indispensable en lecture** : avec un
 * simple `application/json`, Cookidoo renvoie une vue aplatie façon schema.org
 * où les annotations (guided cooking) sont totalement absentes — on croirait à
 * tort qu'elles n'ont pas été enregistrées (cf. docs/COOKIDOO-CONTRAT.md §3).
 */
const FULL_VIEW_ACCEPT = "application/vnd.vorwerk.customer-recipe.full+json";

function headers(ctx: ClientCtx, accept = "application/json"): Record<string, string> {
  return {
    Cookie: ctx.cookieHeader,
    Accept: accept,
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
  opts: { idempotent?: boolean; accept?: string } = {},
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
      headers: headers(ctx, opts.accept),
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

/** Encode l'id dans le chemin : il transite par la base et ne doit jamais
 *  pouvoir s'échapper du segment d'URL (défense en profondeur). */
function recipePath(ctx: ClientCtx, id: string): string {
  return `/created-recipes/${ctx.lang}/${encodeURIComponent(id)}`;
}

function patchFields(ctx: ClientCtx, id: string, fields: Record<string, unknown>): Promise<unknown> {
  return request(ctx, "PATCH", recipePath(ctx, id), fields);
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
// ── Image : upload Cloudinary puis association à la recette ──────────────────
//
// Contrat confirmé par inspection réseau de l'éditeur cookidoo.fr :
//   1. POST /created-recipes/{lang}/image/signature  {timestamp, source} → {signature}
//   2. POST <Cloudinary>/image/upload (multipart, signé)                → {public_id, format}
//   3. PATCH /created-recipes/{lang}/{id}  {image: "<public_id>.<format>"}
// Le champ `image` attend donc l'identifiant Cloudinary, PAS une URL externe :
// Cookidoo ré-héberge l'image sur son propre CDN.
const CLOUDINARY_UPLOAD_URL = "https://api-eu.cloudinary.com/v1_1/vorwerk-users-gc/image/upload";
const CLOUDINARY_UPLOAD_PRESET = "prod-customer-recipe-signed";
/** Clé publique du widget Cloudinary de Vorwerk (non secrète, visible côté navigateur). */
const CLOUDINARY_API_KEY = "993585863591145";
const CLOUDINARY_SOURCE = "uw";

/**
 * N'autorise que les images servies par le stockage Supabase du projet : ces
 * octets sont téléchargés côté serveur, une URL arbitraire exposerait la
 * fonction à une SSRF (réseau interne, métadonnées cloud).
 */
export function isAllowedImageUrl(rawUrl: string, allowedHost: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && url.hostname === allowedHost;
  } catch {
    return false;
  }
}

/**
 * Télécharge l'image, l'envoie sur le Cloudinary de Cookidoo puis l'associe à
 * la recette. `allowedImageHost` borne l'origine téléchargeable (anti-SSRF).
 */
export async function uploadRecipeImage(
  ctx: ClientCtx,
  id: string,
  imageUrl: string,
  allowedImageHost: string,
): Promise<void> {
  if (!isAllowedImageUrl(imageUrl, allowedImageHost)) {
    throw new Error(`Origine d'image non autorisée : ${imageUrl}`);
  }

  const doFetch = ctx.fetchImpl ?? fetch;

  const imgRes = await doFetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Téléchargement de l'image → HTTP ${imgRes.status}`);
  const blob = await imgRes.blob();

  // 1. Signature délivrée par Cookidoo (authentifiée par cookies).
  const timestamp = Math.floor(Date.now() / 1000);
  const { signature } = await request<{ signature: string }>(
    ctx,
    "POST",
    `/created-recipes/${ctx.lang}/image/signature`,
    { timestamp, source: CLOUDINARY_SOURCE },
  );
  if (!signature) throw new Error("Signature d'upload d'image non délivrée");

  // 2. Upload multipart signé vers Cloudinary (hors domaine Cookidoo : pas de cookies).
  const form = new FormData();
  form.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  form.append("source", CLOUDINARY_SOURCE);
  form.append("signature", signature);
  form.append("timestamp", String(timestamp));
  form.append("api_key", CLOUDINARY_API_KEY);
  form.append("file", blob, "recipe.jpg");

  const upRes = await doFetch(CLOUDINARY_UPLOAD_URL, { method: "POST", body: form });
  const upText = await upRes.text();
  if (!upRes.ok) {
    throw new Error(`Upload Cloudinary → HTTP ${upRes.status} : ${upText.slice(0, 300)}`);
  }
  const uploaded = JSON.parse(upText) as { public_id?: string; format?: string };
  if (!uploaded.public_id) throw new Error("Upload Cloudinary sans public_id");

  // 3. Association : le champ `image` prend « <public_id>.<format> ».
  const asset = uploaded.format ? `${uploaded.public_id}.${uploaded.format}` : uploaded.public_id;
  await patchFields(ctx, id, { image: asset, isImageOwnedByUser: false });
}

export function getRecipe(ctx: ClientCtx, id: string): Promise<unknown> {
  return request(ctx, "GET", recipePath(ctx, id), undefined, { accept: FULL_VIEW_ACCEPT });
}

// ── Vue « appareil » : le seul oracle de validation du guided cooking ────────
//
// `/device/recipes/{id}` renvoie la recette telle que le TM7 la reçoit. C'est le
// seul endroit où l'on voit si une annotation est réellement exploitable :
// Cookidoo accepte un mode inconnu en 200 OK, le stocke, puis le dégrade en
// simple texte à la conversion. Cf. docs/COOKIDOO-CONTRAT.md §8.

/** Étape telle que l'appareil la reçoit. `CustomerAnnotations` = étape guidée. */
interface DevicePrompt {
  Type?: string;
  PreparationStepIndex?: number;
}

interface DeviceRecipe {
  PromptDetails?: { Prompts?: DevicePrompt[] };
}

/** Recette dans la vue destinée à l'appareil (structure `SchemaVersion`/`PromptDetails`). */
export function getDeviceRecipe(ctx: ClientCtx, id: string): Promise<DeviceRecipe> {
  return request<DeviceRecipe>(
    ctx,
    "GET",
    `/created-recipes/${ctx.lang}/device/recipes/${encodeURIComponent(id)}`,
  );
}

/**
 * Contrôle post-export : parmi les étapes censées être guidées, renvoie les
 * index de celles que l'appareil a dégradées en simple texte (ou qui manquent).
 *
 * Un tableau vide signifie que tout le guided cooking est passé. Toute entrée
 * signale une annotation refusée **sans erreur HTTP** — le seul mode d'échec
 * réellement silencieux de cette API.
 */
export async function findUnguidedSteps(
  ctx: ClientCtx,
  id: string,
  expectedGuidedIndexes: number[],
): Promise<number[]> {
  const device = await getDeviceRecipe(ctx, id);
  const prompts = device.PromptDetails?.Prompts ?? [];
  const guided = new Set(
    prompts
      .filter((p) => p.Type === "CustomerAnnotations")
      .map((p) => p.PreparationStepIndex),
  );
  return expectedGuidedIndexes.filter((i) => !guided.has(i));
}

export function deleteRecipe(ctx: ClientCtx, id: string): Promise<unknown> {
  return request(ctx, "DELETE", recipePath(ctx, id));
}

/** URL web de la recette créée (consultable dans un navigateur). */
export function recipeWebUrl(ctx: ClientCtx, id: string): string {
  return `${API_BASE}${recipePath(ctx, id)}`;
}
