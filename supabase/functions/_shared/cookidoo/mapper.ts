/**
 * Transformation recette recipe-hug → payload Cookidoo (/created-recipes).
 *
 * Pur (sans réseau) → testable en isolation. Le parsing des annotations
 * machine (temps / vitesse / température / Varoma) est volontairement
 * « best-effort » sur du texte d'étape français : il fiabilise le guided
 * cooking quand l'étape suit le format Thermomix usuel (« 30 sec/vitesse 5 »,
 * « 8 min/100°C/vitesse 2 », « 15 min/Varoma/vitesse 1 »), et reste inerte
 * sinon (l'étape reste une simple consigne).
 */
import type {
  Annotation,
  CookidooIngredient,
  CookidooRecipePayload,
  CookidooStep,
  Ingredient,
  Recipe,
  ThermomixTool,
} from "./types.ts";

export interface MapOptions {
  tools?: ThermomixTool[]; // défaut ["TM7"]
  defaultServings?: number; // défaut 4
  hints?: string;
}

/** « 200 g de farine » → "200 g de farine" ; gère quantité/unité absentes. */
export function formatIngredient(ing: Ingredient): string {
  const qty =
    ing.quantity === null || ing.quantity === undefined || Number.isNaN(ing.quantity)
      ? ""
      : String(ing.quantity);
  const unit = (ing.unit ?? "").trim();
  return [qty, unit, ing.name.trim()].filter((p) => p.length > 0).join(" ").trim();
}

// ── Extracteurs (regex FR) ───────────────────────────────────────────────────
interface Found {
  start: number;
  end: number;
}

function num(raw: string): number {
  return parseFloat(raw.replace(",", "."));
}

/** Renvoie {seconds, span} pour la 1re durée trouvée (« 30 sec », « 8 min », « 30 s »). */
function extractTime(text: string): { seconds: number; span: Found } | null {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(min(?:ute)?s?|sec(?:onde)?s?|s)\b/i);
  if (!m || m.index === undefined) return null;
  const value = num(m[1]);
  const unit = m[2].toLowerCase();
  const seconds = unit.startsWith("min") ? Math.round(value * 60) : Math.round(value);
  return { seconds, span: { start: m.index, end: m.index + m[0].length } };
}

/** « vitesse 5 », « vit. 2 », « vitesse mijotage » → "5" / "2" / "mijotage". */
function extractSpeed(text: string): { speed: string; span: Found } | null {
  const m = text.match(/(?:vitesse|vit\.?)\s*([\wéè.,/-]+)/i);
  if (!m || m.index === undefined) return null;
  const speed = m[1].replace(/[.,;]+$/, "").trim();
  return { speed, span: { start: m.index, end: m.index + m[0].length } };
}

/** « 100°C », « 37° », « 90 °C » → "100" / "37" / "90". */
function extractTemperature(text: string): { value: string; span: Found } | null {
  const m = text.match(/(\d{2,3})\s*°\s*c?/i);
  if (!m || m.index === undefined) return null;
  return { value: m[1], span: { start: m.index, end: m.index + m[0].length } };
}

function extractVaroma(text: string): Found | null {
  const m = text.match(/varoma/i);
  if (!m || m.index === undefined) return null;
  return { start: m.index, end: m.index + m[0].length };
}

/**
 * Construit les annotations machine d'une étape.
 * Regroupe temps/vitesse/température dans un seul empan (TTS), ou STEAMING si « Varoma ».
 */
export function parseStepAnnotations(text: string): Annotation[] {
  const time = extractTime(text);
  const speed = extractSpeed(text);
  const temp = extractTemperature(text);
  const varoma = extractVaroma(text);

  const spans = [time?.span, speed?.span, temp?.span, varoma].filter(
    (s): s is Found => !!s,
  );
  if (spans.length === 0) return [];

  const start = Math.min(...spans.map((s) => s.start));
  const end = Math.max(...spans.map((s) => s.end));
  const position = { offset: start, length: end - start };

  if (varoma) {
    const data: Record<string, unknown> = { direction: "CW", accessory: "Varoma" };
    if (time) data.time = time.seconds;
    if (speed) data.speed = speed.speed;
    return [{ type: "MODE", name: "STEAMING", data, position }];
  }

  const data: Record<string, unknown> = {};
  if (time) data.time = time.seconds;
  if (speed) data.speed = speed.speed;
  if (temp) data.temperature = { value: temp.value, unit: "C" };
  return [{ type: "TTS", data, position }];
}

// ── Mapping principal ────────────────────────────────────────────────────────
export function mapRecipeToCookidoo(
  recipe: Recipe,
  opts: MapOptions = {},
): CookidooRecipePayload {
  const tools = opts.tools && opts.tools.length > 0 ? opts.tools : (["TM7"] as ThermomixTool[]);
  const servings = recipe.servings ?? opts.defaultServings ?? 4;

  const ingredients: CookidooIngredient[] = recipe.ingredients.map((i) => ({
    type: "INGREDIENT",
    text: formatIngredient(i),
  }));

  const ordered = [...recipe.steps].sort((a, b) => a.order - b.order);
  const instructions: CookidooStep[] = ordered.map((s) => ({
    type: "STEP",
    text: s.text.trim(),
    annotations: parseStepAnnotations(s.text),
  }));

  const totalTime =
    ordered.reduce((acc, s) => acc + (s.duration_minutes ?? 0), 0) * 60;

  return {
    name: recipe.title.trim(),
    image: null,
    isImageOwnedByUser: false,
    tools,
    yield: { value: servings, unitText: "portion" },
    prepTime: 0,
    cookTime: 0,
    totalTime,
    ingredients,
    instructions,
    hints: opts.hints ?? "",
    workStatus: "PRIVATE",
    recipeMetadata: { requiresAnnotationsCheck: false },
  };
}
