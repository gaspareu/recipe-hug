// ===== Validation de la sortie LLM de `analyze-recipe` =====
//
// La réponse du modèle est une donnée externe non fiable : on ne la renvoie
// (et donc on ne l'écrit en base) qu'après validation de schéma. Isolé ici
// pour être testable sans démarrer de serveur (voir analyze-output_test.ts).

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

export const AnalysisSchema = z.object({
  ai_summary: z.string().min(1).max(2000),
  nutrition_tags: z.array(z.string().min(1).max(50)).max(5).default([]),
  calorie_score: z.number().int().min(1).max(5).nullable().default(null),
  season: z.string().min(1).max(50).nullable().default(null),
});

export type Analysis = z.infer<typeof AnalysisSchema>;

export type ParseAnalysisResult =
  | { ok: true; data: Analysis }
  | { ok: false; error: string };

/**
 * Nettoie les éventuelles balises markdown ```json, parse en JSON puis valide
 * contre `AnalysisSchema`. Les clés inconnues sont retirées (zod strip par
 * défaut) — on ne propage que le format attendu.
 */
export function parseAnalysis(rawText: string): ParseAnalysisResult {
  let json: unknown;
  try {
    const clean = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    json = JSON.parse(clean);
  } catch {
    return { ok: false, error: "La réponse de l'IA n'est pas un JSON valide." };
  }

  const result = AnalysisSchema.safeParse(json);
  if (!result.success) {
    return { ok: false, error: "La réponse de l'IA ne respecte pas le format attendu." };
  }
  return { ok: true, data: result.data };
}
