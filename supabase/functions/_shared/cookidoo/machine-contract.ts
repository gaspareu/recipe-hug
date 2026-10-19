/** Contrat d'export : distinct des conseils culinaires généraux du TM7. */
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { normalizeSpeed, TM7_MAX_SECONDS } from "../thermomix/reference.ts";

export const MACHINE_RULES = {
  dough_parameters_forbidden: {
    field: "mode",
    message: "Pétrin : durée seule, sans vitesse, température ni sens inverse.",
  },
  speed_required: {
    field: "speed",
    message: "Hors Pétrin et Rissoler, une vitesse canonique est requise.",
  },
  steam_speed_exceeded: {
    field: "speed",
    message: "Vapeur : vitesse maximale 5.",
  },
  butterfly_speed_exceeded: {
    field: "speed",
    message: "Fouet : vitesse maximale 4.",
  },
  browning_temperature_required: {
    field: "temperature",
    message: "Rissoler : température de 140 à 160°C requise.",
  },
  browning_speed_forbidden: {
    field: "speed",
    message: "Rissoler ne porte pas de vitesse manuelle.",
  },
  power_outside_browning: {
    field: "power",
    message: "Puissance réservée au mode Rissoler.",
  },
} as const;

export const MachineSchema = z.object({
  mode: z.enum([
    "mix",
    "chop",
    "grate",
    "knead",
    "steam",
    "slow_cook",
    "high_temp",
    "warm",
    "emulsify",
    "thicken",
    "sauce",
    "cook",
  ]),
  seconds: z.number().int().min(1).max(TM7_MAX_SECONDS),
  temperature: z.union([z.number().min(37).max(160), z.literal("Varoma")])
    .optional(),
  speed: z.string().refine(
    (s) => normalizeSpeed(s) === s && s !== "Turbo",
    "Vitesse invalide",
  ).optional(),
  reverse: z.boolean().optional(),
  accessory: z.enum([
    "blade",
    "butterfly",
    "basket",
    "varoma",
    "spatula",
    "measuring_cup",
  ]).optional(),
  power: z.enum(["Intense", "Gentle"]).optional(),
}).strict().superRefine((p, ctx) => {
  const invalid = (rule: keyof typeof MACHINE_RULES) =>
    ctx.addIssue({
      code: "custom",
      message: MACHINE_RULES[rule].message,
      path: [MACHINE_RULES[rule].field],
      params: { rule },
    });
  if (
    p.mode === "knead" && (p.speed || p.temperature !== undefined || p.reverse)
  ) invalid("dough_parameters_forbidden");
  if (!["knead", "high_temp"].includes(p.mode) && !p.speed) {
    invalid("speed_required");
  }
  if (
    (p.mode === "steam" || p.temperature === "Varoma" ||
      p.accessory === "varoma") && p.speed && Number(p.speed) > 5
  ) invalid("steam_speed_exceeded");
  if (p.accessory === "butterfly" && p.speed && Number(p.speed) > 4) {
    invalid("butterfly_speed_exceeded");
  }
  if (
    p.mode === "high_temp" &&
    (typeof p.temperature !== "number" || p.temperature < 140)
  ) invalid("browning_temperature_required");
  if (p.mode === "high_temp" && p.speed) invalid("browning_speed_forbidden");
  if (p.power && p.mode !== "high_temp") invalid("power_outside_browning");
});

export function buildCookidooMachinePrompt(): string {
  return `CONTRAT MACHINE COOKIDOO :
Modes : ${MachineSchema.innerType().shape.mode.options.join(", ")}.
Durée : seconds entier de 1 à ${TM7_MAX_SECONDS}. Température facultative : 37 à 160°C ou "Varoma" ; jamais une température de four.
speed : chaîne "0.5" à "10" par pas de 0.5, ou "mijotage". Aucun Turbo.
${Object.values(MACHINE_RULES).map((r) => r.message).join("\n")}
Exemples valides : {"mode":"knead","seconds":240} ; {"mode":"high_temp","seconds":240,"temperature":150,"power":"Gentle"} ; {"mode":"mix","seconds":20,"speed":"2"}.
Un beurre noisette peut rester préparé manuellement : ne pas le remplacer par du beurre simplement fondu.`;
}
