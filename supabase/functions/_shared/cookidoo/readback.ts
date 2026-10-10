import type { CookidooRecipePayload } from "./types.ts";

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function contains(actual: unknown, expected: unknown): boolean {
  const obj = object(expected);
  if (!obj) return actual === expected;
  const remote = object(actual);
  return !!remote && Object.entries(obj).every(([key, value]) => contains(remote[key], value));
}

/** La vue full doit préserver le contenu et les réglages, pas seulement renvoyer HTTP 200. */
export function verifyReadback(payload: CookidooRecipePayload, response: unknown): string[] {
  const root = object(response);
  const content = object(root?.recipeContent) ?? root;
  if (!content || !Array.isArray(content.instructions) || !Array.isArray(content.ingredients)) return ["content_not_verified"];
  const warnings = new Set<string>();
  if (content.instructions.length !== payload.instructions.length || content.ingredients.length !== payload.ingredients.length) warnings.add("content_mismatch");
  payload.ingredients.forEach((ing, i) => {
    if (object((content.ingredients as unknown[])[i])?.text !== ing.text) warnings.add("content_mismatch");
  });
  payload.instructions.forEach((step, i) => {
    const remote = object((content.instructions as unknown[])[i]);
    if (remote?.text !== step.text) warnings.add("content_mismatch");
    const annotations = Array.isArray(remote?.annotations) ? remote.annotations : [];
    for (const expected of step.annotations) {
      const found = annotations.some((a: unknown) => {
        const value = object(a);
        if (!value || value.type !== expected.type || !contains(value.position, expected.position)) return false;
        if (expected.type === "INGREDIENT") {
          const description = object(value.data)?.description;
          return (object(description)?.text ?? description) === expected.data.description;
        }
        return value.name === expected.name && contains(value.data, expected.data);
      });
      if (!found) warnings.add("annotations_mismatch");
    }
  });
  return [...warnings];
}
