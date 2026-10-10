/**
 * Validation structurelle du payload Cookidoo AVANT tout appel réseau.
 *
 * Objectif : échouer tôt et clairement (sans consommer d'authentification ni de
 * budget de requêtes ~10/min) quand la recette est inexploitable. Les plages
 * machine (vitesses/températures) sont déjà normalisées par le mapper via le
 * référentiel TM7 ; ici on ne contrôle que la structure minimale exportable.
 */
import type { CookidooRecipePayload } from "./types.ts";
import { normalizeSpeed, TM7_MAX_SECONDS } from "../thermomix/reference.ts";

export interface PayloadValidation {
  ok: boolean;
  errors: string[];
}

export function validateCookidooPayload(payload: CookidooRecipePayload): PayloadValidation {
  const errors: string[] = [];

  if (!payload.name || payload.name.trim().length === 0) {
    errors.push("titre manquant");
  }
  if (!Array.isArray(payload.ingredients) || payload.ingredients.length === 0) {
    errors.push("aucun ingrédient");
  }
  if (!Array.isArray(payload.instructions) || payload.instructions.length === 0) {
    errors.push("aucune étape");
  }

  for (const [i, step] of (payload.instructions ?? []).entries()) {
    const prefix = `étape ${i + 1}`;
    if (!step.text.trim()) errors.push(`${prefix} : texte vide`);
    const occupied: { start: number; end: number }[] = [];
    for (const annotation of step.annotations ?? []) {
      const { offset, length } = annotation.position;
      if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length <= 0 || offset + length > step.text.length) {
        errors.push(`${prefix} : position d'annotation invalide`);
      }
      if (occupied.some((span) => offset < span.end && offset + length > span.start)) errors.push(`${prefix} : annotations qui se chevauchent`);
      occupied.push({ start: offset, end: offset + length });
      const data = annotation.data;
      if (!Object.keys(data).length) errors.push(`${prefix} : annotation vide`);
      if (annotation.type === "INGREDIENT") {
        if (typeof data.description !== "string" || !data.description.trim()) errors.push(`${prefix} : ingrédient sans description`);
        continue;
      }
      if (annotation.type !== "TTS" && annotation.type !== "MODE") errors.push(`${prefix} : type d'annotation inconnu`);
      if (annotation.type === "MODE" && !["dough", "browning"].includes(annotation.name ?? "")) errors.push(`${prefix} : mode Cookidoo non vérifié`);
      if (data.time !== undefined && (!Number.isInteger(data.time) || Number(data.time) <= 0 || Number(data.time) > TM7_MAX_SECONDS)) errors.push(`${prefix} : durée hors plage`);
      if (data.speed !== undefined && data.speed !== "soft" && (typeof data.speed !== "string" || normalizeSpeed(data.speed) !== data.speed || data.speed === "Turbo")) errors.push(`${prefix} : vitesse hors plage`);
      if (data.direction !== undefined && data.direction !== "CCW") errors.push(`${prefix} : sens invalide`);
      if (data.temperature !== undefined) {
        const temperature = data.temperature as { value?: unknown; unit?: unknown };
        const n = Number(temperature?.value);
        if (temperature?.value !== "varoma" && (typeof temperature?.value !== "string" || !Number.isFinite(n) || n < 37 || n > 160 || temperature.unit !== "C")) errors.push(`${prefix} : température hors plage`);
        if (temperature?.value === "varoma" && temperature.unit !== undefined) errors.push(`${prefix} : Varoma sans unité`);
      }
      if (annotation.name === "dough" && (data.speed !== undefined || data.temperature !== undefined)) errors.push(`${prefix} : Pétrin doit porter une durée seule`);
      if (data.power !== undefined && (annotation.name !== "browning" || !["Intense", "Gentle"].includes(String(data.power)))) errors.push(`${prefix} : puissance invalide`);
    }
  }

  return { ok: errors.length === 0, errors };
}
