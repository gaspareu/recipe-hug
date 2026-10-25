import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { MachineSchema } from "./machine-contract.ts";

export const SourcePartSchema = z.object({
  order: z.number().int().positive(),
  part: z.number().int().nonnegative(),
}).strict();
export const StepKindSchema = z.enum([
  "keep",
  "replace",
  "transfer",
  "technical",
]);
export const ManualActionSchema = z.enum([
  "source",
  "empty_bowl",
  "wash_bowl",
  "add_steam_water",
  "transfer_to_varoma",
  "transfer_to_bowl",
]);
export const AdaptationStepFields = {
  source_orders: z.array(z.number().int().positive()).min(1).max(100),
  source_parts: z.array(SourcePartSchema).max(200),
  manual_action: ManualActionSchema.optional(),
  duration_minutes: z.number().finite().nonnegative().max(1440).optional(),
  tm7: MachineSchema.nullable(),
  uses: z.array(
    z.object({
      ingredient_index: z.number().int().nonnegative(),
      quantity: z.number().finite().nonnegative().nullable().optional(),
    }).strict(),
  ).max(200),
};
export const AdaptationMetadataFields = {
  changes: z.array(z.string().min(1).max(500)).max(30),
  notes: z.array(z.string().min(1).max(500)).max(30),
  blockers: z.array(z.string().min(1).max(500)).max(20),
};
export const PlanStepSchema = z.object({
  ...AdaptationStepFields,
  kind: StepKindSchema,
  preparation_from: z.array(SourcePartSchema).max(200).optional(),
}).strict();
export const PlanSchema = z.object({
  ...AdaptationMetadataFields,
  steps: z.array(PlanStepSchema).min(1).max(100),
}).strict();
export type ActionPlan = z.infer<typeof PlanSchema>;

// Le contenu d'une étape réparée reste inconnu ici : le plan entier est ensuite
// validé avec PlanSchema, y compris les contraintes machine personnalisées.
export const RepairSchema = z.object({
  edits: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      steps: z.array(z.unknown()).max(20),
    }).strict(),
  ).min(1).max(20),
}).strict();
