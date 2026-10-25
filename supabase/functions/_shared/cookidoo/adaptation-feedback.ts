import type { adaptationFailureDiagnostic } from "./adaptation-diagnostics.ts";
import type { Recipe } from "./types.ts";

export type RepairStop =
  | "limit"
  | "same_failure"
  | "cycle"
  | "invalid_patch"
  | "unrepairable";
type Diagnostic = ReturnType<typeof adaptationFailureDiagnostic>;
const causes: Record<string, string> = {
  preparation_reference_required:
    "Un ingrédient est mentionné sans ajout déclaré ni lien vers la préparation qui le contient.",
  ingredient_missing: "Un ingrédient de la recette n’a pas été repris.",
  invalid_ingredient: "Une étape utilise un ingrédient inconnu.",
  duplicate_use: "Un ingrédient est ajouté deux fois dans la même étape.",
  missing_quantity:
    "Un ingrédient partagé entre plusieurs ajouts n’a pas de répartition complète.",
  unknown_quantity:
    "Une quantité absente de la source a été inventée ou répartie.",
  non_positive_quantity: "Un ajout contient une quantité nulle.",
  total_quantity_changed:
    "La somme des ajouts ne correspond pas à la quantité source.",
  ingredient_mismatch:
    "L’utilisation d’un ingrédient ne correspond pas à la recette.",
  action_duplicate: "Une action source est exécutée plusieurs fois.",
  action_missing: "Une action source a été omise.",
  preparation_unavailable: "Une étape reprend une préparation indisponible.",
  transfer_invalid: "Un transfert de préparation est incohérent.",
  bowl_not_empty_before_water:
    "Le bol contient encore des aliments avant l’ajout d’eau vapeur.",
  technical_water_conflict:
    "Des aliments sont dirigés vers le bol contenant l’eau vapeur.",
  technical_water_missing:
    "La cuisson vapeur proposée n’a pas d’eau technique disponible ; elle peut être conservée manuelle.",
  invalid_schema:
    "Une étape ne respecte pas le format ou les réglages TM7 attendus.",
};

/** Explication destinée au propriétaire ; jamais utilisée comme journal technique. */
export function adaptationBlockers(
  diagnostic: Diagnostic,
  source: Recipe,
  stop: RepairStop,
): string[] {
  const rule = "rule" in diagnostic ? diagnostic.rule : undefined;
  const cause = causes[rule ?? diagnostic.reason] ??
    "Le plan proposé reste incohérent avec les actions et préparations de la recette.";
  const ingredients = "ingredient_indexes" in diagnostic
    ? diagnostic.ingredient_indexes.flatMap((i) =>
      source.ingredients[i] ? [source.ingredients[i].name.slice(0, 100)] : []
    )
    : [];
  const orders = "source_parts" in diagnostic
    ? [...new Set(diagnostic.source_parts.map((r) => r.order))]
    : [];
  return [
    stop === "limit"
      ? "La correction automatique a atteint sa limite de trois corrections. Aucun envoi n’a été effectué."
      : stop === "same_failure" || stop === "cycle"
      ? "La correction automatique a été arrêtée car elle répétait un blocage. Aucun envoi n’a été effectué."
      : "La correction automatique n’a pas pu poursuivre la validation. Aucun envoi n’a été effectué.",
    `${cause}${
      ingredients.length ? ` Ingrédient(s) : ${ingredients.join(", ")}.` : ""
    }${orders.length ? ` Étape(s) source : ${orders.join(", ")}.` : ""}`,
    "Vous pouvez réessayer l’adaptation sans ajouter d’eau ni de commentaire pour contourner ce blocage technique.",
  ];
}
