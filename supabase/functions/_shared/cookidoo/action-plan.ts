/** Une réalisation par fragment ; les transferts réutilisent une préparation existante. */
import {
  type Adaptation,
  renderAdaptation,
  withTechnicalWater,
} from "./adaptation.ts";
import { PlanError, type SourcePart } from "./plan-errors.ts";
import { type ActionPlan, PlanSchema } from "./plan-schema.ts";
import { resolveIngredientUses } from "./ingredient-uses.ts";
import { isSteamAction } from "./settings.ts";
import { sourceParts } from "./source-parts.ts";
import type { Recipe } from "./types.ts";
import { mapRecipeToCookidoo } from "./mapper.ts";
import { validateCookidooPayload } from "./validate.ts";

const key = (ref: SourcePart) => `${ref.order}:${ref.part}`;
const normalize = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
type Location = "bowl" | "container" | "varoma";
export function validateActionPlan(
  source: Recipe,
  input: unknown,
  technicalWaterMl?: number,
): ActionPlan {
  const plan = PlanSchema.parse(input);
  const texts = new Map<string, string>(
    source.steps.flatMap((s) =>
      sourceParts(s.text).map((text, part) =>
        [`${s.order}:${part}`, text] as const
      )
    ),
  );
  const orders = new Set(source.steps.map((s) => s.order));
  const owners = new Map<string, number>();
  const locations = new Map<string, Location>();
  const groups = new Map<string, number>();
  const consumedBy = new Map<string, number>();
  const ingredientsIn = new Map<string, Set<number>>();
  const lastManual = new Map<number, { part: number; index: number }>();
  const recipe = withTechnicalWater(source, technicalWaterMl);
  const waterIndex = technicalWaterMl === undefined
    ? -1
    : recipe.ingredients.length - 1;
  let waterInBowl = false;
  let waterAddedAt: number | undefined;
  // Ne déduire aucune quantité du texte. Un nom simple non ambigu permet en
  // revanche de refuser un aliment manuel passé sous silence par le plan.
  const aliases = recipe.ingredients.map((ingredient) =>
    normalize(ingredient.name).match(/\p{L}{3,}/u)?.[0] ?? ""
  );
  plan.steps.forEach((step, index) => {
    const fail = (
      reason: ConstructorParameters<typeof PlanError>[0],
      refs = step.source_parts,
      affected = [index],
    ) => {
      throw new PlanError(reason, affected, refs);
    };
    if (step.source_orders.some((order) => !orders.has(order))) {
      fail("unknown_source_part");
    }
    const consumer = step.kind === "keep" || step.kind === "replace";
    if (consumer !== (step.source_parts.length > 0)) fail("treatment_invalid");
    if ((step.kind === "replace") !== (step.tm7 !== null)) {
      fail("treatment_invalid");
    }
    if (
      step.kind === "keep" && step.manual_action &&
      step.manual_action !== "source"
    ) fail("treatment_invalid");
    if (step.kind === "replace" && step.manual_action) {
      fail("treatment_invalid");
    }
    if (
      step.kind === "technical" &&
      !["wash_bowl", "add_steam_water"].includes(step.manual_action ?? "")
    ) fail("treatment_invalid");
    if (
      step.kind === "transfer" &&
      !["empty_bowl", "transfer_to_bowl", "transfer_to_varoma"].includes(
        step.manual_action ?? "",
      )
    ) fail("treatment_invalid");
    if (
      (step.kind === "transfer" ||
        (step.kind === "technical" && step.manual_action === "wash_bowl")) &&
      step.uses.length
    ) fail("treatment_invalid");
    const inputs = step.preparation_from ?? [];
    if (step.kind === "transfer" && !inputs.length) {
      fail("preparation_unavailable");
    }
    if (step.kind === "technical" && inputs.length) fail("treatment_invalid");
    if (new Set(inputs.map(key)).size !== inputs.length) {
      fail("transfer_invalid", inputs);
    }
    for (const ref of inputs) {
      if (!locations.has(key(ref)) || !ingredientsIn.get(key(ref))?.size) {
        const producers = plan.steps.flatMap((s, i) =>
          s.source_parts.some((part) => key(part) === key(ref)) ? [i] : []
        );
        fail("preparation_unavailable", [ref], [
          ...new Set([
            index,
            ...producers,
            ...(consumedBy.has(key(ref)) ? [consumedBy.get(key(ref))!] : []),
          ]),
        ]);
      }
    }
    const steam = isSteamAction(step.tm7);
    if (steam && technicalWaterMl === undefined) {
      fail("technical_water_missing");
    }
    const addsWater = step.uses.some((use) =>
      use.ingredient_index === waterIndex
    );
    if (step.manual_action === "add_steam_water" && !addsWater) {
      fail("technical_water_missing");
    }
    if (
      addsWater &&
      (step.manual_action !== "add_steam_water" || step.uses.length !== 1 ||
        !plan.steps.slice(index + 1).some((s) => isSteamAction(s.tm7)))
    ) {
      fail("treatment_invalid");
    }
    if (
      waterInBowl &&
      (step.manual_action === "transfer_to_bowl" || (step.tm7 && !steam))
    ) {
      fail("technical_water_conflict", [], [waterAddedAt!, index]);
    }
    if (steam && !waterInBowl) fail("technical_water_missing");
    if (step.kind === "replace") {
      const target = steam ? "varoma" : "bowl";
      for (const ref of inputs) {
        if (locations.get(key(ref)) !== target) {
          fail("transfer_invalid", [ref], [owners.get(key(ref))!, index]);
        }
      }
    }
    if (
      step.kind === "keep" &&
      inputs.some((ref) => locations.get(key(ref)) !== "container")
    ) fail("transfer_invalid", inputs);
    if (step.kind === "transfer") {
      const destination: Location = step.manual_action === "empty_bowl"
        ? "container"
        : step.manual_action === "transfer_to_bowl"
        ? "bowl"
        : "varoma";
      const origins = new Set(inputs.map((ref) => locations.get(key(ref))!));
      if (
        origins.size !== 1 || origins.has(destination) ||
        (step.manual_action === "empty_bowl" && !origins.has("bowl"))
      ) fail("transfer_invalid", inputs);
      const origin = [...origins][0];
      // Un vidage/transfert du bol porte sur tout son contenu ; ne jamais laisser
      // une partie de la préparation fictivement dans le bol après un vidage.
      const moved = origin === "bowl"
        ? [...locations.keys()].filter((k) => locations.get(k) === "bowl")
        : [...locations.keys()].filter((id) =>
          inputs.some((ref) => groups.get(key(ref)) === groups.get(id))
        );
      for (const id of moved) locations.set(id, destination);
      if (origin === "bowl") waterInBowl = false;
    }
    if (
      step.manual_action === "wash_bowl" &&
      [...locations.values()].includes("bowl")
    ) fail("bowl_not_empty_before_wash");
    if (
      step.manual_action === "add_steam_water" &&
      [...locations.values()].includes("bowl")
    ) {
      const occupied = [...locations.keys()].filter((id) =>
        locations.get(id) === "bowl"
      );
      fail("bowl_not_empty_before_water", [], [
        ...new Set([index, ...occupied.map((id) => owners.get(id)!)]),
      ]);
    }
    if (addsWater) {
      waterInBowl = true;
      waterAddedAt = index;
    }
    if (step.manual_action === "wash_bowl") waterInBowl = false;
    const content = new Set(step.uses.map((u) => u.ingredient_index));
    const consumedGroups = new Set(inputs.map((ref) => groups.get(key(ref))!));
    if (step.kind === "replace") {
      // Une nouvelle action transforme tout le contenu du bol/Varoma, même
      // si le modèle omet la référence de continuation. Les anciennes références
      // ne doivent pas pouvoir ressusciter cette même matière plus tard.
      for (const [id, location] of locations) {
        if (location === (steam ? "varoma" : "bowl")) {
          consumedGroups.add(groups.get(id)!);
        }
      }
      const contextual = step.source_parts.filter((ref) =>
        /\b(?:ajout\w*|incorpor\w*|vers\w*|melang\w*|remu\w*)\b/u.test(
          normalize(texts.get(key(ref)) ?? ""),
        )
      );
      const external = [...locations.keys()].filter((id) =>
        contextual.some((ref) => Number(id.split(":")[0]) === ref.order) &&
        !consumedGroups.has(groups.get(id)!)
      );
      if (external.length) {
        fail(
          "preparation_unavailable",
          external.map((id) => {
            const [order, part] = id.split(":").map(Number);
            return { order, part };
          }),
          [...new Set([index, ...external.map((id) => owners.get(id)!)])],
        );
      }
    }
    const consumed = [...locations.keys()].filter((id) =>
      consumedGroups.has(groups.get(id)!)
    );
    for (const id of consumed) {
      for (const ingredient of ingredientsIn.get(id) ?? []) {
        content.add(ingredient);
      }
    }
    if (consumer) {
      const text = normalize(
        step.source_parts.map((ref) => texts.get(key(ref)) ?? "").join(" "),
      );
      aliases.forEach((alias, ingredient_index) => {
        if (
          !alias || aliases.filter((a) => a === alias).length !== 1 ||
          content.has(ingredient_index)
        ) return;
        if (
          !new RegExp(`(?:^|[^\\p{L}])${alias}(?:$|[^\\p{L}])`, "u").test(text)
        ) return;
        const related = plan.steps.flatMap((s, i) =>
          s.uses.some((u) => u.ingredient_index === ingredient_index) ? [i] : []
        );
        throw new PlanError(
          "ingredient_mismatch",
          [...new Set([index, ...related])],
          step.source_parts,
          [ingredient_index],
        );
      });
    }
    if (consumer) {
      for (const id of consumed) {
        locations.delete(id);
        groups.delete(id);
        consumedBy.set(id, index);
      }
    }
    for (const ref of step.source_parts) {
      const id = key(ref);
      if (!texts.has(id) || !step.source_orders.includes(ref.order)) {
        fail("unknown_source_part", [ref]);
      }
      if (owners.has(id)) {
        fail("action_duplicate", [ref], [owners.get(id)!, index]);
      }
      if (step.kind === "keep") {
        const previous = lastManual.get(ref.order);
        if (previous && ref.part <= previous.part) {
          fail("manual_order_changed", [ref], [
            ...new Set([previous.index, index]),
          ]);
        }
        lastManual.set(ref.order, { part: ref.part, index });
      } else if (
        /\bfour\b|enfourn|laisser\s+(?:reposer|lever|pousser|refroidir|tiédir)|laisse\s+(?:reposer|lever|pousser|refroidir|tiédir)|\brepos\b|façonn|dresser|dressage/iu
          .test(texts.get(id)!)
      ) {
        fail("treatment_invalid", [ref]);
      }
      owners.set(id, index);
      locations.set(
        id,
        step.kind === "keep" ? "container" : steam ? "varoma" : "bowl",
      );
      ingredientsIn.set(id, new Set(content));
      groups.set(id, index);
    }
  });
  for (const [id] of texts) {
    if (owners.has(id)) continue;
    const [order, part] = id.split(":").map(Number);
    const affected = plan.steps.flatMap((s, i) =>
      s.source_orders.includes(order) ? [i] : []
    );
    // Une insertion après la dernière étape peut réparer une action entièrement absente.
    throw new PlanError("action_missing", [...affected, plan.steps.length], [{
      order,
      part,
    }]);
  }
  const resolvedUses = resolveIngredientUses(
    recipe.ingredients,
    plan.steps,
    (ingredient_index) =>
      plan.steps.flatMap((s, i) => {
        const alias = aliases[ingredient_index];
        return alias && aliases.filter((a) => a === alias).length === 1 &&
            s.source_parts.some((ref) =>
              new RegExp(`(?:^|[^\\p{L}])${alias}(?:$|[^\\p{L}])`, "u")
                .test(normalize(texts.get(key(ref)) ?? ""))
            )
          ? [i]
          : [];
      }),
  );
  return {
    ...plan,
    steps: plan.steps.map((step, i) => ({ ...step, uses: resolvedUses[i] })),
  };
}

export function applyActionPlan(
  source: Recipe,
  input: unknown,
  technicalWaterMl?: number,
): Adaptation {
  const plan = validateActionPlan(source, input, technicalWaterMl);
  const rendered = {
    ...plan,
    steps: plan.steps.map(({ kind, preparation_from: _inputs, ...step }) => ({
      ...step,
      ...(kind === "keep" ? {} : { source_parts: undefined }),
      // Le rendu reprend le texte source des étapes conservées uniquement.
    })),
  };
  const result = renderAdaptation(source, rendered, technicalWaterMl);
  result.recipe.steps = result.recipe.steps.map((step, index) => ({
    ...step,
    ...(plan.steps[index].kind !== "replace" ? { manual_only: true } : {}),
  }));
  if (!validateCookidooPayload(mapRecipeToCookidoo(result.recipe)).ok) {
    throw new PlanError("plan_invalid", []);
  }
  return result;
}
