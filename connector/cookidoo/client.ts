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

/** Remplit une recette existante avec le payload complet. */
export function patchRecipe(
  ctx: ClientCtx,
  id: string,
  payload: CookidooRecipePayload,
): Promise<unknown> {
  return request(ctx, "PATCH", `/created-recipes/${ctx.lang}/${id}`, payload);
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
