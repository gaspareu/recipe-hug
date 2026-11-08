/** Schémas transport ; le plan et les contraintes culinaires sont validés par applyActionPlan. */
import { MachineSchema } from "./machine-contract.ts";
import { ManualActionSchema, StepKindSchema } from "./plan-schema.ts";

/** Décodage uniquement à la frontière fournisseur, avant validation métier. */
export function parseAdaptationJson(output: string): unknown {
  if (typeof output !== "string" || output.length > 100000) {
    throw new Error("invalid_ai_output");
  }
  return JSON.parse(
    output.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
  );
}

type JsonSchema = Record<string, unknown>;
const object = (
  properties: Record<string, JsonSchema>,
  required = Object.keys(properties),
): JsonSchema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const array = (items: JsonSchema): JsonSchema => ({ type: "array", items });
const integer = { type: "integer" };
const machine = object({
  mode: { type: "string", enum: MachineSchema.innerType().shape.mode.options },
  seconds: integer,
  temperature: {
    anyOf: [{ type: "number" }, { type: "string", enum: ["Varoma"] }],
  },
  speed: { type: "string" },
  reverse: { type: "boolean" },
  accessory: {
    type: "string",
    enum: MachineSchema.innerType().shape.accessory.unwrap().options,
  },
  power: {
    type: "string",
    enum: MachineSchema.innerType().shape.power.unwrap().options,
  },
}, ["mode", "seconds"]);

export const ADAPTATION_STEP_JSON_SCHEMA = object({
  kind: { type: "string", enum: StepKindSchema.options },
  source_orders: array(integer),
  source_parts: array(object({ order: integer, part: integer })),
  preparation_from: array(object({ order: integer, part: integer })),
  manual_action: {
    type: "string",
    enum: ManualActionSchema.options,
  },
  duration_minutes: { type: "number" },
  tm7: { anyOf: [machine, { type: "null" }] },
  uses: array(
    object({
      ingredient_index: integer,
      quantity: { type: ["number", "null"] },
    }, ["ingredient_index"]),
  ),
}, ["kind", "source_orders", "source_parts", "tm7", "uses"]);

export const ADAPTATION_JSON_SCHEMA = object({
  steps: array(ADAPTATION_STEP_JSON_SCHEMA),
  changes: array({ type: "string" }),
  notes: array({ type: "string" }),
  blockers: array({ type: "string" }),
});

export const ADAPTATION_REPAIR_JSON_SCHEMA = object({
  edits: array(
    object({ index: integer, steps: array(ADAPTATION_STEP_JSON_SCHEMA) }),
  ),
});
