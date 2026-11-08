/** Métadonnées générées : aucun état de revue personnelle n'est accepté. */
export const PROFILE_LIST_FIELDS = [
  "roles", "flavors", "textures", "equipment", "allergens",
  "dietary_compatibilities", "dietary_exclusions",
] as const;
export interface GeneratedPairingProfile {
  roles: string[]; flavors: string[]; textures: string[]; equipment: string[];
  allergens: string[]; dietary_compatibilities: string[]; dietary_exclusions: string[];
  active_minutes: number | null; make_ahead: boolean;
}
export const RECIPE_METADATA_PROPERTIES = {
  entry_kind: { type: "string", enum: ["preparation", "complete_dish"], description: "Préparation réutilisable (base, sauce, accompagnement, entrée, dessert…) ou plat complet autonome." },
  ai_summary: { type: "string", description: "Description culinaire en 1-2 phrases." },
  season: { type: "string", enum: ["printemps", "été", "automne", "hiver", "toutes saisons"] },
  nutrition_tags: { type: "array", items: { type: "string" }, maxItems: 5 },
  calorie_score: { type: "integer", minimum: 1, maximum: 5 },
  pairing_profile: {
    type: "object",
    properties: {
      ...Object.fromEntries(PROFILE_LIST_FIELDS.map(key => [key, { type: "array", items: { type: "string" }, maxItems: 20 }])),
      active_minutes: { type: "integer", minimum: 0, description: "Temps de travail actif estimé, hors cuisson et repos passifs." },
      make_ahead: { type: "boolean" },
    },
    required: [...PROFILE_LIST_FIELDS, "active_minutes", "make_ahead"],
  },
};
export const RECIPE_METADATA_PROMPT = `Pour chaque création ou complétion, fournis aussi toutes les métadonnées du Livre :
- entry_kind : preparation pour une base, sauce, garniture, accompagnement, entrée ou dessert réutilisable ; complete_dish pour un plat qui constitue à lui seul un repas. Ne laisse pas une nouvelle fiche à classer.
- ai_summary, season, nutrition_tags (1 à 3), calorie_score (1 = très calorique, 5 = très léger).
- pairing_profile : roles (base, accompagnement, sauce, garniture, entree, dessert ; tableau vide si aucun), flavors, textures, equipment réellement nécessaire, active_minutes estimé et make_ahead.
- Dans ce profil, renseigne allergens, dietary_compatibilities et dietary_exclusions à partir des ingrédients précis. Ne déduis pas une absence d'allergène d'un ingrédient ambigu. N'affirme jamais une certification ou une vérification personnelle : les états de revue appartiennent à l'utilisateur.
Fournis les tableaux même vides. Déduis ces informations de la recette sans ajouter de questions de classement à l'utilisateur.`;

/** Nettoie strictement les données IA avant toute écriture du profil. */
export function parseGeneratedPairingProfile(value: unknown): GeneratedPairingProfile | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  for (const key of PROFILE_LIST_FIELDS) {
    const list = data[key];
    if (!Array.isArray(list) || list.length > 20 || list.some(item => typeof item !== "string" || !item.trim() || item.length > 100)) return null;
  }
  if (data.active_minutes !== null && (typeof data.active_minutes !== "number" || !Number.isInteger(data.active_minutes) || data.active_minutes < 0 || data.active_minutes > 10080)) return null;
  if (typeof data.make_ahead !== "boolean") return null;
  return {
    ...Object.fromEntries(PROFILE_LIST_FIELDS.map(key => [key, data[key]])),
    active_minutes: data.active_minutes, make_ahead: data.make_ahead,
  } as GeneratedPairingProfile;
}
