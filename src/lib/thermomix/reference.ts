/**
 * Référentiel Thermomix TM7 — MIROIR FRONT.
 *
 * Copie strictement identique de la SOURCE DE VÉRITÉ edge
 * `supabase/functions/_shared/thermomix/reference.ts` (Deno ne pouvant pas
 * importer depuis `src/`). Toute modification doit être répercutée dans les
 * DEUX fichiers — le test de garde `reference.sync.test.ts` échoue sinon.
 *
 * Contenu : capacités réelles du TM7 (vitesses, températures, modes,
 * accessoires), barème de conversion « recette libre → format Thermomix », et
 * fonctions pures de normalisation/validation.
 *
 * Références : specs Vorwerk TM7 (2025) + modes officiels Cookidoo.
 */

// ── Types machine ────────────────────────────────────────────────────────────

/** Modes de fonctionnement du TM7 pertinents pour la rédaction d'une étape. */
export type Tm7Mode =
  | "mix" // Mélanger / mixer
  | "chop" // Hacher
  | "grate" // Râper
  | "turbo" // Turbo (impulsions)
  | "knead" // Pétrin (mode épi)
  | "steam" // Cuisson vapeur (Varoma)
  | "sous_vide" // Sous-vide
  | "slow_cook" // Cuisson lente / mijoter
  | "high_temp" // Hautes températures / rissoler
  | "ferment" // Fermentation
  | "sugar" // Cuisson du sucre
  | "warm" // Réchauffage
  | "emulsify" // Émulsionner / monter (fouet)
  | "thicken" // Épaissir
  | "sauce" // Sauce
  | "cook"; // Cuisson standard (temp + vitesse manuelles)

/** Accessoires physiques du TM7. */
export type Tm7Accessory =
  | "blade" // couteau / lame mixante
  | "butterfly" // fouet papillon
  | "basket" // panier de cuisson
  | "varoma" // Varoma (plat + plateau + couvercle)
  | "spatula" // spatule
  | "measuring_cup"; // gobelet doseur

/** Température d'une étape : valeur en °C, ou le mode vapeur « Varoma ». */
export type Tm7Temperature = number | "Varoma";

/**
 * Puissance du rissolage (mode hautes températures). Détermine l'intention
 * machine envoyée au TM7 : « Intense » → `HighTemperature_FullPower`,
 * « Gentle » → `HighTemperature_MediumPower` (cf. docs/COOKIDOO-CONTRAT.md §4).
 */
export type Tm7Power = "Intense" | "Gentle";

/**
 * Paramètres machine d'une étape TM7. Tous optionnels sauf `mode` : une étape
 * purement manuelle (éplucher, réserver) n'a pas de bloc `tm7` du tout.
 */
export interface Tm7StepParams {
  mode: Tm7Mode;
  /** Durée en secondes. */
  seconds?: number;
  /** Température (°C) ou « Varoma ». */
  temperature?: Tm7Temperature;
  /** Vitesse canonique : "0.5".."10", "mijotage" ou "Turbo". */
  speed?: string;
  /** Rotation en sens inverse (mélange sans hacher). */
  reverse?: boolean;
  accessory?: Tm7Accessory;
  /** Puissance du rissolage — n'a de sens que pour `mode: "high_temp"`. */
  power?: Tm7Power;
}

// ── Constantes de plages (capacités réelles du TM7) ─────────────────────────

export const TM7_SPEED_MIN = 0.5;
export const TM7_SPEED_MAX = 10;
export const TM7_SPEED_STEP = 0.5;
/** En cuisson vapeur (Varoma), la vitesse est plafonnée. */
export const TM7_STEAM_SPEED_MAX = 5;
/** Vitesses non numériques valides. */
export const TM7_SPECIAL_SPEEDS = ["mijotage", "Turbo"] as const;

export const TM7_TEMP_MIN = 37;
export const TM7_TEMP_MAX = 160;
/** Plancher du rissolage / hautes températures. */
export const TM7_BROWNING_TEMP_MIN = 140;

/** Sentinelle du mode vapeur (sélectionné, pas saisi comme valeur °C). */
export const VAROMA = "Varoma" as const;

/** Durée maximale plausible d'une opération machine (garde-fou : 3 h). */
export const TM7_MAX_SECONDS = 3 * 60 * 60;

// ── Spécification des modes ──────────────────────────────────────────────────

export interface Tm7ModeSpec {
  /** Libellé français affiché / utilisé dans le texte d'étape. */
  label: string;
  tempMin?: number;
  tempMax?: number;
  speedMin?: number;
  speedMax?: number;
  /** Le mode s'appuie sur la cuisson vapeur (Varoma). */
  usesVaroma?: boolean;
  /** Le sens inverse est l'usage courant pour ce mode. */
  reverseTypical?: boolean;
  accessory?: Tm7Accessory;
}

/**
 * Plages indicatives par mode (ordres de grandeur « experts » servant à guider
 * l'IA et à contrôler la cohérence — pas des limites matérielles strictes,
 * hormis les bornes globales vitesse/température).
 */
export const TM7_MODES: Record<Tm7Mode, Tm7ModeSpec> = {
  mix: { label: "Mélanger", speedMin: 1, speedMax: 4 },
  chop: { label: "Hacher", speedMin: 5, speedMax: 10 },
  grate: { label: "Râper", speedMin: 5, speedMax: 10 },
  turbo: { label: "Turbo" },
  knead: { label: "Pétrin", accessory: "blade" },
  steam: {
    label: "Cuisson vapeur",
    usesVaroma: true,
    speedMin: 1,
    speedMax: TM7_STEAM_SPEED_MAX,
    accessory: "varoma",
  },
  sous_vide: { label: "Sous-vide", tempMin: 45, tempMax: 90 },
  slow_cook: {
    label: "Mijoter",
    tempMin: 70,
    tempMax: 100,
    speedMin: 1,
    speedMax: 1,
    reverseTypical: true,
  },
  high_temp: {
    label: "Rissoler",
    tempMin: TM7_BROWNING_TEMP_MIN,
    tempMax: 160,
    speedMin: 1,
    speedMax: 2,
    reverseTypical: true,
  },
  ferment: { label: "Fermentation", tempMin: 30, tempMax: 45 },
  sugar: { label: "Cuisson du sucre", tempMin: 100, tempMax: 160 },
  warm: { label: "Réchauffage", tempMin: 37, tempMax: 95, speedMin: 1, speedMax: 2 },
  emulsify: { label: "Monter au fouet", speedMin: 3, speedMax: 4, accessory: "butterfly" },
  thicken: { label: "Épaissir", tempMin: 80, tempMax: 100, speedMin: 3, speedMax: 4 },
  sauce: {
    label: "Sauce",
    tempMin: 90,
    tempMax: 100,
    speedMin: 1,
    speedMax: 2,
    reverseTypical: true,
  },
  cook: { label: "Cuisson", tempMin: 37, tempMax: 120, speedMin: 1, speedMax: 3 },
};

/** Libellés FR des accessoires (affichage / texte d'étape). */
export const TM7_ACCESSORY_LABELS: Record<Tm7Accessory, string> = {
  blade: "couteau",
  butterfly: "fouet papillon",
  basket: "panier de cuisson",
  varoma: "Varoma",
  spatula: "spatule",
  measuring_cup: "gobelet doseur",
};

// ── Barème de conversion « recette libre → Thermomix » ──────────────────────

export interface Tm7ConversionHint {
  action: string;
  guidance: string;
}

/**
 * Directives standard de conversion (issues des pratiques Cookidoo). Servent de
 * repères à l'IA pour transformer une action de cuisine en réglage TM7 crédible.
 */
export const TM7_CONVERSION_CHEATSHEET: Tm7ConversionHint[] = [
  { action: "Hacher oignon, ail, herbes", guidance: "5 s / vitesse 5-7" },
  { action: "Hacher / mixer finement", guidance: "10 s / vitesse 8-10" },
  { action: "Réduire en purée / potage lisse", guidance: "1 min / vitesse 8-10" },
  { action: "Mélanger des ingrédients secs", guidance: "5 s / vitesse 4" },
  { action: "Crémer beurre + sucre", guidance: "1 min / vitesse 4" },
  { action: "Incorporer délicatement", guidance: "15 s / vitesse 2 / sens inverse" },
  { action: "Pétrir une pâte levée", guidance: "2-3 min / mode Pétrin" },
  { action: "Faire revenir / rissoler", guidance: "3-5 min / 120-160 °C / vitesse 1 / sens inverse" },
  { action: "Cuire à la vapeur (légumes, poisson)", guidance: "15-30 min / Varoma / vitesse 1" },
  { action: "Mijoter une sauce", guidance: "X min / 90-100 °C / vitesse 1 / sens inverse" },
  { action: "Monter blancs en neige / chantilly", guidance: "3-4 min / vitesse 3-4 / fouet papillon" },
  { action: "Émulsionner une mayonnaise", guidance: "vitesse 4 / fouet papillon, ajout d'huile en filet" },
];

// ── Normalisation (fonctions pures) ──────────────────────────────────────────

function normalizeSpeedNumber(n: number): string | null {
  if (!Number.isFinite(n)) return null;
  if (n < TM7_SPEED_MIN || n > TM7_SPEED_MAX) return null;
  const snapped = Math.round(n / TM7_SPEED_STEP) * TM7_SPEED_STEP;
  return Number.isInteger(snapped) ? String(snapped) : snapped.toFixed(1);
}

/**
 * Ramène une vitesse (nombre ou texte) à sa forme canonique TM7, ou `null` si
 * elle est hors plage / non reconnue.
 *   5 → "5" · "2,5" → "2.5" · "Turbo" → "Turbo" · "mijotage" → "mijotage"
 *   25 → null · "vitesse folle" → null
 */
export function normalizeSpeed(raw: string | number | undefined | null): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number") return normalizeSpeedNumber(raw);
  const s = raw.trim().toLowerCase();
  if (s === "") return null;
  if (s === "turbo") return "Turbo";
  if (s.includes("mijot")) return "mijotage";
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? normalizeSpeedNumber(n) : null;
}

/**
 * Ramène une température dans la plage physique du TM7, ou `null` si absurde.
 * « Varoma » est conservé tel quel. Une valeur légèrement débordante est
 * bornée (165 → 160) ; une valeur aberrante (< 0, > 300, NaN) est rejetée.
 */
export function clampTemperature(
  value: Tm7Temperature | undefined | null,
): Tm7Temperature | null {
  if (value === undefined || value === null) return null;
  if (value === VAROMA) return VAROMA;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > 300) return null;
  return Math.min(TM7_TEMP_MAX, Math.max(TM7_TEMP_MIN, value));
}

// ── Génération du bloc de référence pour le prompt IA ────────────────────────

/**
 * Construit un bloc texte décrivant le TM7 (vitesses, températures, modes,
 * accessoires, barème) à injecter dans le prompt système de génération de
 * recettes. Centralise la « base de référence » pour éviter toute dérive.
 */
export function buildTm7ReferenceForPrompt(): string {
  const modes = (Object.keys(TM7_MODES) as Tm7Mode[])
    .map((key) => {
      const m = TM7_MODES[key];
      const parts: string[] = [];
      if (m.tempMin !== undefined && m.tempMax !== undefined) {
        parts.push(`${m.tempMin}-${m.tempMax} °C`);
      }
      if (m.speedMin !== undefined && m.speedMax !== undefined) {
        parts.push(
          m.speedMin === m.speedMax ? `vitesse ${m.speedMin}` : `vitesse ${m.speedMin}-${m.speedMax}`,
        );
      }
      if (m.usesVaroma) parts.push("Varoma");
      if (m.reverseTypical) parts.push("sens inverse fréquent");
      if (m.accessory) parts.push(TM7_ACCESSORY_LABELS[m.accessory]);
      return `- ${m.label} (${key})${parts.length ? " : " + parts.join(", ") : ""}`;
    })
    .join("\n");

  const cheatsheet = TM7_CONVERSION_CHEATSHEET.map((h) => `- ${h.action} → ${h.guidance}`).join("\n");

  return [
    "RÉFÉRENTIEL THERMOMIX TM7 (base de référence à respecter) :",
    `- Vitesses : ${TM7_SPEED_MIN} à ${TM7_SPEED_MAX} (pas de ${TM7_SPEED_STEP}), plus « Turbo » et « mijotage ». Cuisson vapeur : vitesse ≤ ${TM7_STEAM_SPEED_MAX}.`,
    `- Températures : ${TM7_TEMP_MIN} à ${TM7_TEMP_MAX} °C. « Varoma » = mode vapeur (ne pas écrire de °C). Rissolage : ${TM7_BROWNING_TEMP_MIN}-${TM7_TEMP_MAX} °C.`,
    "- « Sens inverse » = rotation qui mélange sans hacher (mijotage, morceaux fragiles).",
    "- Accessoires : " + Object.values(TM7_ACCESSORY_LABELS).join(", ") + ".",
    "",
    "Modes disponibles :",
    modes,
    "",
    "Barème de conversion action → réglage TM7 :",
    cheatsheet,
  ].join("\n");
}
