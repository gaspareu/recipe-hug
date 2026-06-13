/**
 * Client HTTP des endpoints /created-recipes de Cookidoo.
 *
 * Auth par cookies (_oauth2_proxy + v-authenticated) — pas de Bearer token.
 * Base URL : https://cookidoo.fr  (les cookies sont scopés à ce domaine)
 * Séquence d'upload : POST create → attendre ~5 s → PATCH (payload complet).
 * Rate limit observé ~10 req/min — espacer les envois.
 */
import type { CookidooRecipePayload } from "./types.ts";

const API_BASE = "https://cookidoo.fr";

export interface ClientCtx {
  cookieHeader: string;  // cookies sérialisés pour cookidoo.fr
  lang: string;          // ex. "fr-FR"
}

function headers(ctx: ClientCtx): Record<string, string> {
  return {
    Cookie: ctx.cookieHeader,
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-requested-with": "xmlhttprequest",
  };
}

async function request<T>(
  ctx: ClientCtx,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: headers(ctx),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} → HTTP ${res.status} : ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/** Crée une recette vide, renvoie son id. */
export async function createRecipe(ctx: ClientCtx, name: string): Promise<string> {
  const data = await request<Record<string, string>>(
    ctx,
    "POST",
    `/created-recipes/${ctx.lang}`,
    { recipeName: name },
  );
  const id = data.id ?? data.recipeId ?? data._id;
  if (!id) throw new Error(`Création OK mais aucun id renvoyé : ${JSON.stringify(data)}`);
  return id;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  await patchFields(ctx, id, { ingredients: payload.ingredients });
  await sleep(2000);
  await patchFields(ctx, id, { instructions: payload.instructions });
  await sleep(2000);
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
