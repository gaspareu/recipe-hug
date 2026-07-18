/**
 * Transformation recette recipe-hug → payload Cookidoo (/created-recipes).
 *
 * Annotations « guided cooking » d'une étape, par ordre de priorité :
 *  1. Champs structurés `step.tm7` (générés par l'IA experte TM7) — source
 *     fiable : temps, vitesse, température, Varoma, sens inverse, accessoire.
 *  2. Fallback « best-effort » : parsing regex du texte français, pour les
 *     recettes existantes sans `tm7` (compatibilité ascendante).
 * S'ajoutent les annotations INGREDIENT (liaison texte ↔ liste d'ingrédients),
 * ce qui rend une étape réellement « guidée » sur l'écran du TM7.
 *
 * Pur (sans réseau) → testable en isolation.
 */
import type {
  Annotation,
  CookidooIngredient,
  CookidooRecipePayload,
  CookidooStep,
  Ingredient,
  Recipe,
  Step,
  ThermomixTool,
} from "./types.ts";
import {
  clampTemperature,
  normalizeSpeed,
  TM7_MAX_SECONDS,
  TM7_STEAM_SPEED_MAX,
  VAROMA,
} from "../thermomix/reference.ts";
import type { Tm7StepParams } from "../thermomix/reference.ts";

export interface MapOptions {
  tools?: ThermomixTool[]; // défaut ["TM7"]
  defaultServings?: number; // défaut 4
  hints?: string;
  /** URL publique de l'image du plat à transmettre à Cookidoo (optionnel). */
  imageUrl?: string;
}

// ── Formatage des ingrédients ────────────────────────────────────────────────

// Unités de mesure introduisant « de » (« 200 g de farine »). « pièce » ou unité
// absente donnent une forme sans « de » (« 2 œufs »).
const MEASURE_UNITS = new Set([
  "g", "kg", "mg", "ml", "cl", "dl", "l",
  "c. à soupe", "c. à café", "cuillère à soupe", "cuillère à café", "càs", "càc",
  "pincée", "pincées", "goutte", "gouttes", "verre", "verres", "sachet", "sachets",
]);

function isMeasureUnit(unit: string): boolean {
  return MEASURE_UNITS.has(unit.trim().toLowerCase());
}

function startsWithVowelOrMuteH(word: string): boolean {
  return /^[aeiouyàâäéèêëïîôöûüh]/i.test(word.trim());
}

/** « 200 g de farine », « 1 L d'eau », « 2 œufs », « sel, à volonté ». */
export function formatIngredient(ing: Ingredient): string {
  const qty =
    ing.quantity === null || ing.quantity === undefined || Number.isNaN(ing.quantity)
      ? ""
      : String(ing.quantity);
  const unit = (ing.unit ?? "").trim();
  const name = ing.name.trim();
  const prep = ing.preparation?.trim();

  let core: string;
  if (unit && isMeasureUnit(unit)) {
    const liaison = startsWithVowelOrMuteH(name) ? "d'" : "de ";
    core = `${qty} ${unit} ${liaison}${name}`.trim();
  } else {
    // « pièce » ou sans unité : quantité + nom (ex. « 2 œufs »)
    core = [qty, name].filter((p) => p.length > 0).join(" ");
  }
  return prep ? `${core}, ${prep}` : core;
}

// ── Extracteurs regex (fallback texte libre) ─────────────────────────────────
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
  const raw = m[1];
  const speed = raw.replace(/[.,;]+$/, "").trim();
  // La classe de caractères capture la ponctuation finale (« vitesse 1. ») : on
  // la retire aussi de l'empan, pour que l'annotation couvre le seul réglage.
  const trailing = raw.length - speed.length;
  return { speed, span: { start: m.index, end: m.index + m[0].length - trailing } };
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

type Span = { offset: number; length: number };

interface TextParams {
  time: { seconds: number; span: Found } | null;
  speed: { speed: string; span: Found } | null;
  temp: { value: string; span: Found } | null;
  varoma: Found | null;
  /** Empan couvrant tous les réglages trouvés, ou `null` si le texte n'en a aucun. */
  position: Span | null;
}

function spanOf(spans: Found[]): Span | null {
  if (spans.length === 0) return null;
  const start = Math.min(...spans.map((s) => s.start));
  const end = Math.max(...spans.map((s) => s.end));
  return { offset: start, length: end - start };
}

/**
 * Extrait en UNE passe les réglages machine présents dans le texte, avec leur
 * empan global. L'empan positionne l'annotation TTS sur le seul segment de
 * réglages : les annotations INGREDIENT occupent d'autres segments de la phrase
 * et ne doivent pas être chevauchées.
 */
function extractTextParams(text: string): TextParams {
  const time = extractTime(text);
  const speed = extractSpeed(text);
  const temp = extractTemperature(text);
  const varoma = extractVaroma(text);
  const spans = [time?.span, speed?.span, temp?.span, varoma].filter((s): s is Found => !!s);
  return { time, speed, temp, varoma, position: spanOf(spans) };
}

/** Annotation TTS dérivée des réglages lus dans le texte. */
function annotationsFromText(p: TextParams): Annotation[] {
  if (!p.position) return [];
  const data: Record<string, unknown> = {};
  if (p.time) data.time = p.time.seconds;
  if (p.speed) data.speed = p.speed.speed;
  if (p.varoma) data.temperature = { value: "varoma" };
  else if (p.temp) data.temperature = { value: p.temp.value, unit: "C" };
  return [{ type: "TTS", data, position: p.position }];
}

/**
 * Construit l'annotation machine d'une étape à partir de son TEXTE (fallback
 * pour les recettes sans `tm7`). Regroupe temps/vitesse/température dans un seul
 * empan (TTS). « Varoma » → `temperature: { value: "varoma" }`.
 */
export function parseStepAnnotations(text: string): Annotation[] {
  return annotationsFromText(extractTextParams(text));
}

// ── Vocabulaire Cookidoo (confirmé par inspection réseau) ────────────────────

/** La vitesse « mijotage » du TM7 s'écrit « soft » dans le payload Cookidoo. */
function toCookidooSpeed(speed: string): string {
  return speed === "mijotage" ? "soft" : speed;
}

/**
 * Modes TM7 portant une annotation `MODE` nommée côté Cookidoo. Les autres
 * réglages passent par une annotation `TTS` (temps/température/vitesse).
 */
const COOKIDOO_MODE_NAMES: Partial<Record<Tm7StepParams["mode"], string>> = {
  knead: "dough",
  high_temp: "browning",
};

// ── Annotation TTS depuis les paramètres structurés TM7 ──────────────────────

/**
 * Construit l'annotation TTS d'une étape à partir de ses paramètres machine.
 * Les valeurs sont normalisées via le référentiel TM7 ; un paramètre invalide
 * est simplement omis (dégradation propre) plutôt que d'émettre du bruit.
 */
function ttsFromTm7(text: string, tm7: Tm7StepParams, span: Span | null): Annotation | null {
  const data: Record<string, unknown> = {};

  // Durée bornée au maximum plausible d'une opération (garde-fou du référentiel).
  if (
    tm7.seconds !== undefined && Number.isFinite(tm7.seconds) &&
    tm7.seconds > 0 && tm7.seconds <= TM7_MAX_SECONDS
  ) {
    data.time = Math.round(tm7.seconds);
  }

  // Varoma : mode vapeur, température « Varoma » explicite, ou accessoire Varoma.
  const usesVaroma =
    tm7.mode === "steam" || tm7.temperature === VAROMA || tm7.accessory === "varoma";

  const speed = normalizeSpeed(tm7.speed);
  if (speed) {
    // Contrainte matérielle du TM7 : en cuisson vapeur, la vitesse est plafonnée.
    const value = parseFloat(speed);
    const capped = usesVaroma && Number.isFinite(value) && value > TM7_STEAM_SPEED_MAX
      ? String(TM7_STEAM_SPEED_MAX)
      : speed;
    data.speed = toCookidooSpeed(capped);
  }

  if (usesVaroma) {
    data.temperature = { value: "varoma" };
  } else {
    const temp = clampTemperature(tm7.temperature);
    if (typeof temp === "number") data.temperature = { value: String(temp), unit: "C" };
  }

  // Sens inverse : Cookidoo l'exprime par le sens de rotation du couteau.
  // L'accessoire n'a pas d'équivalent dans le payload — il reste lisible dans
  // le texte de l'étape.
  if (tm7.reverse) data.direction = "CCW";

  if (Object.keys(data).length === 0) return null;
  // Positionné sur le segment de réglages du texte (« 8 min/100°C/vitesse 2 »,
  // format demandé à l'IA) pour ne pas chevaucher les annotations INGREDIENT ;
  // à défaut, l'étape entière.
  return { type: "TTS", data, position: span ?? { offset: 0, length: text.length } };
}

/**
 * Annotation `MODE` pour les modes nommés du TM7 (Pétrin, Rissoler) : Cookidoo
 * les distingue des réglages manuels temps/température/vitesse (`TTS`).
 */
function modeFromTm7(text: string, tm7: Tm7StepParams, span: Span | null): Annotation | null {
  const name = COOKIDOO_MODE_NAMES[tm7.mode];
  if (!name) return null;

  const data: Record<string, unknown> = {};
  if (
    tm7.seconds !== undefined && Number.isFinite(tm7.seconds) &&
    tm7.seconds > 0 && tm7.seconds <= TM7_MAX_SECONDS
  ) {
    data.time = Math.round(tm7.seconds);
  }
  const temp = clampTemperature(tm7.temperature);
  if (typeof temp === "number") data.temperature = { value: String(temp), unit: "C" };
  // Le rissolage porte une puissance ; « Intense » est le réglage courant.
  if (tm7.mode === "high_temp") data.power = "Intense";

  if (Object.keys(data).length === 0) return null;
  return { type: "MODE", name, data, position: span ?? { offset: 0, length: text.length } };
}

// ── Annotations INGREDIENT (liaison texte ↔ ingrédient) ──────────────────────

function isLetter(ch: string | undefined): boolean {
  return ch !== undefined && /[a-zàâäéèêëïîôöûüç]/i.test(ch);
}

/** Première occurrence de `needle` sur une frontière de mot (évite « ail » dans « travail »). */
function findWordIndex(haystack: string, needle: string): number {
  let from = 0;
  while (from <= haystack.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) return -1;
    if (!isLetter(haystack[idx - 1]) && !isLetter(haystack[idx + needle.length])) return idx;
    from = idx + 1;
  }
  return -1;
}

/**
 * Repère les noms d'ingrédients présents dans le texte de l'étape et crée les
 * annotations INGREDIENT (ce qui « lie » l'ingrédient à l'action sur l'écran TM7).
 */
function ingredientAnnotations(text: string, ingredients: Ingredient[]): Annotation[] {
  const lower = text.toLowerCase();
  const annotations: Annotation[] = [];
  const usedOffsets = new Set<number>();

  for (const ing of ingredients) {
    const name = ing.name.trim();
    if (name.length < 3) continue; // évite les faux positifs sur des mots trop courts
    const idx = findWordIndex(lower, name.toLowerCase());
    if (idx === -1 || usedOffsets.has(idx)) continue;
    usedOffsets.add(idx);
    annotations.push({
      type: "INGREDIENT",
      data: { description: formatIngredient(ing) },
      position: { offset: idx, length: name.length },
    });
  }
  return annotations;
}

/**
 * Annotations complètes d'une étape : annotation machine (MODE pour un mode
 * nommé, sinon TTS — structuré si `tm7`, à défaut repli regex) + INGREDIENT.
 */
function buildStepAnnotations(step: Step, ingredients: Ingredient[]): Annotation[] {
  const text = step.text.trim();
  const params = extractTextParams(text); // une seule passe de regex par étape
  const machine = step.tm7
    ? modeFromTm7(text, step.tm7, params.position) ?? ttsFromTm7(text, step.tm7, params.position)
    : null;
  const machineList = machine ? [machine] : (step.tm7 ? [] : annotationsFromText(params));
  return [...machineList, ...ingredientAnnotations(text, ingredients)];
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
    annotations: buildStepAnnotations(s, recipe.ingredients),
  }));

  // Temps : cuisson = somme des durées machine (tm7.seconds) ; préparation =
  // somme des durées manuelles (duration_minutes) ; total = prépa + cuisson.
  let cookTime = 0;
  let prepTime = 0;
  for (const s of ordered) {
    if (s.tm7?.seconds && s.tm7.seconds > 0) {
      cookTime += Math.round(s.tm7.seconds);
    } else if (s.duration_minutes && s.duration_minutes > 0) {
      prepTime += Math.round(s.duration_minutes * 60);
    }
  }
  const totalTime = prepTime + cookTime;

  // Les annotations sont dérivées automatiquement → demander une revue « guided
  // cooking » côté Cookidoo (filet de sécurité tant que toutes les formes ne
  // sont pas confirmées).
  const hasAnnotations = instructions.some((i) => i.annotations.length > 0);

  const imageUrl = opts.imageUrl?.trim() || null;

  return {
    name: recipe.title.trim(),
    image: imageUrl,
    isImageOwnedByUser: imageUrl !== null,
    tools,
    yield: { value: servings, unitText: "portion" },
    prepTime,
    cookTime,
    totalTime,
    ingredients,
    instructions,
    hints: opts.hints ?? "",
    workStatus: "PRIVATE",
    recipeMetadata: { requiresAnnotationsCheck: hasAnnotations },
  };
}
