/** Schéma transport compact ; les contraintes culinaires restent validées par applyAdaptation. */
import { MachineSchema } from "./machine-contract.ts";

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
    enum: [
      "blade",
      "butterfly",
      "basket",
      "varoma",
      "spatula",
      "measuring_cup",
    ],
  },
  power: { type: "string", enum: ["Intense", "Gentle"] },
}, ["mode", "seconds"]);

export const ADAPTATION_JSON_SCHEMA = object({
  steps: array(object({
    source_orders: array(integer),
    source_parts: array(object({ order: integer, part: integer })),
    manual_action: {
      type: "string",
      enum: [
        "source",
        "empty_bowl",
        "wash_bowl",
        "add_steam_water",
        "transfer_to_varoma",
      ],
    },
    duration_minutes: { type: "number" },
    tm7: { anyOf: [machine, { type: "null" }] },
    uses: array(
      object({
        ingredient_index: integer,
        quantity: { type: ["number", "null"] },
      }, ["ingredient_index"]),
    ),
  }, ["source_orders", "tm7", "uses"])),
  changes: array({ type: "string" }),
  notes: array({ type: "string" }),
  blockers: array({ type: "string" }),
});
