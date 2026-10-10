/**
 * CLI du connecteur Cookidoo — à lancer EN LOCAL (machine perso, IP résidentielle).
 *
 * Compatible Deno et Node ≥ 18 (fetch natif).
 *
 * ── Configuration (variables d'environnement) ────────────────────────────────
 *   COOKIDOO_EMAIL / COOKIDOO_PASSWORD      identifiants Cookidoo
 *   COOKIDOO_COUNTRY   (défaut "fr")        pays du compte (ex. "fr", "de", "it")
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *   # 1) Aperçu sans réseau : affiche le payload Cookidoo généré
 *   node --experimental-strip-types connector/cookidoo/cli.ts --file recette.json --dry-run
 *
 *   # 2) Envoi réel vers Cookidoo (nécessite identifiants + IP résidentielle)
 *   node --env-file=connector/cookidoo/.env --experimental-strip-types connector/cookidoo/cli.ts --file recette.json
 *
 *   # 3) Lecture / suppression
 *   … cli.ts --get <recipeId>
 *   … cli.ts --delete <recipeId>
 *
 * Le fichier recette JSON suit le modèle recipe-hug (voir sample-recipe.json) :
 *   { "title", "servings", "ingredients":[{name,quantity,unit}], "steps":[{order,text,duration_minutes}] }
 */
// Source unique : modules partagés sous supabase/functions/_shared/cookidoo/
// (mêmes fichiers importés par les edge functions — aucune duplication).
import type { Recipe, ThermomixTool } from "../../supabase/functions/_shared/cookidoo/types.ts";
import { mapRecipeToCookidoo } from "../../supabase/functions/_shared/cookidoo/mapper.ts";
import { login, countryToLang, type CookieJar } from "../../supabase/functions/_shared/cookidoo/auth.ts";
import {
  createRecipe,
  deleteRecipe,
  fillRecipe,
  getRecipe,
  recipeWebUrl,
  renameRecipe,
  findUnguidedSteps,
  uploadRecipeImage,
  type ClientCtx,
} from "../../supabase/functions/_shared/cookidoo/client.ts";

import { runExport } from "../../supabase/functions/_shared/cookidoo/run-export.ts";
import { validateCookidooPayload } from "../../supabase/functions/_shared/cookidoo/validate.ts";
import { exportQualityNotes } from "../../supabase/functions/_shared/cookidoo/quality.ts";

// ── Portabilité Deno / Node ──────────────────────────────────────────────────
const g = globalThis as unknown as {
  Deno?: { env: { get(k: string): string | undefined }; args: string[] };
  process?: { env: Record<string, string | undefined>; argv: string[]; exit?: (code: number) => never };
};
const isDeno = typeof g.Deno !== "undefined";
const env = (k: string): string | undefined =>
  isDeno ? g.Deno!.env.get(k) : g.process!.env[k];
const argv: string[] = isDeno ? g.Deno!.args : g.process!.argv.slice(2);

function arg(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : undefined;
}
const has = (name: string): boolean => argv.includes(name);

async function readFile(path: string): Promise<string> {
  if (isDeno) return await (g.Deno as unknown as { readTextFile(p: string): Promise<string> }).readTextFile(path);
  const fs = await import("node:fs/promises");
  return fs.readFile(path, "utf8");
}

function die(msg: string): never {
  console.error(`❌ ${msg}`);
  (isDeno
    ? (g.Deno as unknown as { exit(c: number): never }).exit
    : (g.process!.exit ?? (() => { throw new Error(msg); })))(1);
  throw new Error(msg);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── Auth ─────────────────────────────────────────────────────────────────────

async function authenticate(lang: string): Promise<CookieJar> {
  const email = env("COOKIDOO_EMAIL");
  const password = env("COOKIDOO_PASSWORD");
  if (!email || !password) {
    die("Définir COOKIDOO_EMAIL + COOKIDOO_PASSWORD dans .env ou en variable d'environnement.");
  }
  console.log(`🔑 Auth Cookidoo (${email})…`);
  return login(email, password, lang);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const country = env("COOKIDOO_COUNTRY") ?? "fr";
  const lang = env("COOKIDOO_LANG") ?? countryToLang(country);

  // Modes lecture/suppression
  const getId = arg("--get");
  const delId = arg("--delete");
  if (getId || delId) {
    const jar = await authenticate(lang);
    const ctx: ClientCtx = { cookieHeader: jar.headerForUrl("https://cookidoo.fr"), lang };
    if (getId) console.log(JSON.stringify(await getRecipe(ctx, getId), null, 2));
    if (delId) {
      await deleteRecipe(ctx, delId);
      console.log(`🗑️  Recette ${delId} supprimée.`);
    }
    return;
  }

  // Mode dry-run (pas besoin d'auth)
  const file = arg("--file");
  if (!file) die("Préciser --file <recette.json> (ou --get/--delete <id>).");
  const recipe = JSON.parse(await readFile(file)) as Recipe;

  const toolsArg = arg("--tools");
  const tools = toolsArg
    ? (toolsArg.split(",").map((t) => t.trim()) as ThermomixTool[])
    : (["TM7"] as ThermomixTool[]);

  if (tools.some((tool) => tool !== "TM7")) die("Seul le TM7 est pris en charge.");
  const payload = mapRecipeToCookidoo(recipe, { tools });
  const validation = validateCookidooPayload(payload);
  if (!validation.ok) die(`Recette non exportable : ${validation.errors.join(" ; ")}`);
  const notes = exportQualityNotes(recipe, payload);
  for (const note of notes) console.warn(`⚠️ ${note}`);

  if (has("--dry-run")) {
    console.log("── Payload Cookidoo (dry-run, aucun envoi) ──");
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  // L'outil local ne propose pas de réglages IA : exige une validation explicite
  // des actions manuelles plutôt que prétendre optimiser une recette incomplète.
  if (notes.length && !has("--accept-manual")) die("Précisez les réglages dans le JSON ou confirmez les limites avec --accept-manual.");
  // Envoi réel
  const jar = await authenticate(lang);
  const ctx: ClientCtx = { cookieHeader: jar.headerForUrl("https://cookidoo.fr"), lang };

  const outcome = await runExport({ ctx, payload, existingId: arg("--existing-id") ?? null, supabaseHost: "" }, {
    getRecipe, createRecipe, fillRecipe, renameRecipe, deleteRecipe,
    uploadRecipeImage, findUnguidedSteps, recipeWebUrl,
  }, sleep);
  for (const warning of outcome.warnings) console.warn(`⚠️ ${warning}`);
  console.log(`Recette envoyée : ${outcome.url}`);
  console.log(`Identifiant à réutiliser avec --existing-id : ${outcome.cookidoo_recipe_id}`);
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));
