import { randomUUID } from "node:crypto";

export const SNAPSHOT_VERSION = 1;
export const OWNER_PLACEHOLDER = "00000000-0000-4000-8000-000000000001";
export const SNAPSHOT_TABLES = [
  "profiles",
  "user_ai_settings",
  "user_culinary_preferences",
  "recipes",
  "recipe_versions",
  "meal_plans",
  "ai_conversations",
  "recipe_shares",
];
export const OWNER_FIELDS = {
  profiles: "id",
  user_ai_settings: "user_id",
  user_culinary_preferences: "user_id",
  recipes: "user_id",
  recipe_versions: "user_id",
  meal_plans: "user_id",
  ai_conversations: "user_id",
  recipe_shares: "sender_id",
};
export const TABLE_FIELDS = {
  profiles: ["id", "display_name", "avatar_url", "theme", "created_at", "updated_at"],
  user_ai_settings: ["id", "user_id", "provider", "preferred_model", "agent_configs", "created_at", "updated_at"],
  user_culinary_preferences: [
    "id",
    "user_id",
    "culinary_style",
    "dietary_constraints",
    "kitchen_equipment",
    "taste_preferences",
    "created_at",
    "updated_at",
  ],
  recipes: [
    "id",
    "user_id",
    "ai_summary",
    "calorie_score",
    "cookidoo_exported_at",
    "cookidoo_recipe_id",
    "created_at",
    "ingredients",
    "is_favorite",
    "nutrition_tags",
    "season",
    "servings",
    "source_image_url",
    "source_type",
    "status",
    "steps",
    "title",
    "updated_at",
  ],
  recipe_versions: [
    "id",
    "recipe_id",
    "user_id",
    "change_description",
    "created_at",
    "ingredients",
    "nutrition_tags",
    "season",
    "servings",
    "steps",
    "title",
    "version_number",
  ],
  meal_plans: [
    "id",
    "recipe_id",
    "user_id",
    "created_at",
    "custom_meal",
    "day_of_week",
    "meal_type",
    "notes",
    "updated_at",
    "week_start",
  ],
  ai_conversations: ["id", "user_id", "created_at", "extracted_recipe", "messages", "title", "updated_at"],
  recipe_shares: [
    "id",
    "sender_id",
    "recipient_id",
    "recipient_identifier",
    "claimed_at",
    "created_at",
    "identifier_type",
    "recipe_snapshot",
    "status",
  ],
};

const FORBIDDEN_FIELD_PATTERN = /^(?:api_?key|apiKey|provider_api_keys|providerApiKeys|password|password_enc|passwordEnc|secret|access_token|accessToken|refresh_token|refreshToken|webhook_token|webhookToken)$/i;
const SECRET_VALUE_PATTERNS = [
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}\b/,
  /\bAIza[0-9A-Za-z_-]{20,}\b/,
  /\bsb_secret_[A-Za-z0-9_-]{16,}\b/,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
];
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

function isImageField(field) {
  return /image|avatar/i.test(field);
}

function isImageContainer(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return [value.media_type, value.mime_type, value.mimeType, value.content_type, value.contentType].some(
    (mediaType) => typeof mediaType === "string" && mediaType.trim().toLowerCase().startsWith("image/"),
  );
}

function pick(row, fields) {
  return Object.fromEntries(fields.filter((field) => row[field] !== undefined).map((field) => [field, row[field]]));
}

function mapIds(rows, createId) {
  return new Map(rows.map((row) => [row.id, createId()]));
}

function mappedId(idMap, sourceId, relation) {
  if (sourceId === null || sourceId === undefined) return null;
  const value = idMap.get(sourceId);
  if (!value) throw new Error(`Relation ${relation} introuvable dans le snapshot source (${sourceId}).`);
  return value;
}

function sanitizeNested(value, identityIds, createId) {
  if (Array.isArray(value)) return value.map((item) => sanitizeNested(item, identityIds, createId));
  if (value && typeof value === "object") {
    if (value.type === "image" || value.type === "image_url" || isImageContainer(value)) {
      return null;
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => {
        if (FORBIDDEN_FIELD_PATTERN.test(key)) return [key, null];
        if (isImageField(key) || ["cookidoo_recipe_id", "cookidoo_url"].includes(key)) {
          return [key, null];
        }
        return [key, sanitizeNested(nestedValue, identityIds, createId)];
      }),
    );
  }
  if (typeof value === "string" && /data:image\//i.test(value)) return null;
  if (typeof value === "string") {
    return value.replace(UUID_IN_TEXT_PATTERN, (sourceId) => {
      const normalizedSourceId = sourceId.toLowerCase();
      if (!identityIds.has(normalizedSourceId)) {
        const replacement = createId();
        identityIds.set(normalizedSourceId, replacement);
        identityIds.set(replacement, replacement);
      }
      return identityIds.get(normalizedSourceId);
    });
  }
  return value;
}

function buildIdentityMap(sourceUserId, idMaps) {
  const identities = new Map([[OWNER_PLACEHOLDER, OWNER_PLACEHOLDER]]);
  if (sourceUserId) identities.set(sourceUserId.toLowerCase(), OWNER_PLACEHOLDER);
  for (const idMap of idMaps) {
    for (const [sourceId, replacement] of idMap) {
      identities.set(sourceId.toLowerCase(), replacement);
      identities.set(replacement, replacement);
    }
  }
  return identities;
}

export function assertRowsBelongToUser(rawTables, userId) {
  for (const [table, ownerField] of Object.entries(OWNER_FIELDS)) {
    const foreignRow = (rawTables[table] ?? []).find((row) => row[ownerField] !== userId);
    if (foreignRow) {
      throw new Error(`La RLS a renvoyé une ligne ${table} qui n'appartient pas à l'utilisateur authentifié. Export annulé.`);
    }
  }
}

export function createSanitizedSnapshot(rawTables, options = {}) {
  const {
    includeConversations = false,
    createId = randomUUID,
    generatedAt = new Date().toISOString(),
  } = options;

  const aiSettingIds = mapIds(rawTables.user_ai_settings ?? [], createId);
  const preferenceIds = mapIds(rawTables.user_culinary_preferences ?? [], createId);
  const recipeIds = mapIds(rawTables.recipes ?? [], createId);
  const versionIds = mapIds(rawTables.recipe_versions ?? [], createId);
  const mealPlanIds = mapIds(rawTables.meal_plans ?? [], createId);
  const conversationIds = mapIds(rawTables.ai_conversations ?? [], createId);
  const sourceUserId =
    rawTables.profiles?.[0]?.id ??
    rawTables.user_ai_settings?.[0]?.user_id ??
    rawTables.recipes?.[0]?.user_id ??
    rawTables.meal_plans?.[0]?.user_id;
  const identityIds = buildIdentityMap(sourceUserId, [
    aiSettingIds,
    preferenceIds,
    recipeIds,
    versionIds,
    mealPlanIds,
    conversationIds,
  ]);
  const sanitized = (table, row) => sanitizeNested(pick(row, TABLE_FIELDS[table]), identityIds, createId);

  const snapshot = {
    version: SNAPSHOT_VERSION,
    generated_at: generatedAt,
    privacy: {
      rls_scoped: true,
      production_ids_replaced: true,
      profile_anonymized: true,
      images_removed: true,
      secrets_excluded: true,
      conversations_included: includeConversations,
      shares_included: false,
    },
    tables: {
      profiles: (rawTables.profiles ?? []).slice(0, 1).map((row) => ({
        ...sanitized("profiles", row),
        id: OWNER_PLACEHOLDER,
        display_name: "Utilisateur local",
        avatar_url: null,
      })),
      user_ai_settings: (rawTables.user_ai_settings ?? []).map((row) => ({
        ...sanitized("user_ai_settings", row),
        id: aiSettingIds.get(row.id),
        user_id: OWNER_PLACEHOLDER,
      })),
      user_culinary_preferences: (rawTables.user_culinary_preferences ?? []).map((row) => ({
        ...sanitized("user_culinary_preferences", row),
        id: preferenceIds.get(row.id),
        user_id: OWNER_PLACEHOLDER,
      })),
      recipes: (rawTables.recipes ?? []).map((row) => ({
        ...sanitized("recipes", row),
        id: recipeIds.get(row.id),
        user_id: OWNER_PLACEHOLDER,
        source_image_url: null,
        cookidoo_recipe_id: null,
        cookidoo_exported_at: null,
      })),
      recipe_versions: (rawTables.recipe_versions ?? []).map((row) => ({
        ...sanitized("recipe_versions", row),
        id: versionIds.get(row.id),
        recipe_id: mappedId(recipeIds, row.recipe_id, "recipe_versions.recipe_id"),
        user_id: OWNER_PLACEHOLDER,
      })),
      meal_plans: (rawTables.meal_plans ?? []).map((row) => ({
        ...sanitized("meal_plans", row),
        id: mealPlanIds.get(row.id),
        recipe_id: mappedId(recipeIds, row.recipe_id, "meal_plans.recipe_id"),
        user_id: OWNER_PLACEHOLDER,
      })),
      ai_conversations: includeConversations
        ? (rawTables.ai_conversations ?? []).map((row) => ({
            ...sanitized("ai_conversations", row),
            id: conversationIds.get(row.id),
            user_id: OWNER_PLACEHOLDER,
          }))
        : [],
      recipe_shares: [],
    },
  };

  validateSnapshot(snapshot);
  return snapshot;
}

function visit(value, path, visitor) {
  visitor(value, path);
  if (Array.isArray(value)) {
    value.forEach((item, index) => visit(item, `${path}[${index}]`, visitor));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => visit(item, `${path}.${key}`, visitor));
  }
}

export function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") throw new Error("Snapshot JSON invalide.");
  if (snapshot.version !== SNAPSHOT_VERSION) {
    throw new Error(`Version de snapshot non supportée : ${snapshot.version ?? "absente"}.`);
  }
  if (!snapshot.tables || typeof snapshot.tables !== "object") throw new Error("Section tables absente du snapshot.");

  for (const flag of ["rls_scoped", "production_ids_replaced", "profile_anonymized", "images_removed", "secrets_excluded"]) {
    if (snapshot.privacy?.[flag] !== true) throw new Error(`Garantie de confidentialité absente : privacy.${flag}.`);
  }

  const unknownTables = Object.keys(snapshot.tables).filter((table) => !SNAPSHOT_TABLES.includes(table));
  if (unknownTables.length > 0) throw new Error(`Tables non autorisées dans le snapshot : ${unknownTables.join(", ")}.`);

  for (const table of SNAPSHOT_TABLES) {
    if (!Array.isArray(snapshot.tables[table])) throw new Error(`La table ${table} doit être un tableau.`);
    const allowedFields = new Set(TABLE_FIELDS[table]);
    for (const row of snapshot.tables[table]) {
      const unexpectedFields = Object.keys(row).filter((field) => !allowedFields.has(field));
      if (unexpectedFields.length > 0) {
        throw new Error(`Champs non autorisés dans ${table} : ${unexpectedFields.join(", ")}.`);
      }
    }
    const ids = snapshot.tables[table].map((row) => row.id);
    if (ids.some((id) => typeof id !== "string") || new Set(ids).size !== ids.length) {
      throw new Error(`Identifiants absents ou dupliqués dans ${table}.`);
    }
  }
  if (snapshot.tables.profiles.length !== 1) throw new Error("Le snapshot doit contenir exactement un profil anonymisé.");
  const profile = snapshot.tables.profiles[0];
  if (profile.display_name !== "Utilisateur local" || profile.avatar_url !== null) {
    throw new Error("Le profil du snapshot n'est pas anonymisé.");
  }
  if (
    snapshot.tables.recipes.some(
      (row) => row.source_image_url !== null || row.cookidoo_recipe_id !== null || row.cookidoo_exported_at !== null,
    )
  ) {
    throw new Error("Une recette contient encore une image ou un identifiant Cookidoo.");
  }
  if (snapshot.tables.recipe_shares.length !== 0) {
    throw new Error("Les partages ne sont pas autorisés dans un snapshot local.");
  }
  for (const [table, field] of Object.entries(OWNER_FIELDS)) {
    if (snapshot.tables[table].some((row) => row[field] !== OWNER_PLACEHOLDER)) {
      throw new Error(`Identité non anonymisée dans ${table}.${field}.`);
    }
  }

  visit(snapshot.tables, "tables", (value, path) => {
    const field = path.split(".").at(-1)?.replace(/\[\d+\]$/, "") ?? "";
    if (isImageContainer(value)) throw new Error(`Conteneur image non supprimé dans le snapshot : ${path}.`);
    if (FORBIDDEN_FIELD_PATTERN.test(field)) throw new Error(`Champ sensible interdit dans le snapshot : ${path}.`);
    if (isImageField(field) && value !== null) throw new Error(`Image non supprimée dans le snapshot : ${path}.`);
    if (typeof value !== "string") return;
    if (/data:image\//i.test(value)) throw new Error(`Image encodée non supprimée dans le snapshot : ${path}.`);
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
      throw new Error(`Valeur ressemblant à un secret dans le snapshot : ${path}.`);
    }
    const emails = value.match(EMAIL_PATTERN) ?? [];
    if (emails.some((email) => !email.toLowerCase().endsWith("@example.invalid"))) {
      throw new Error(`Adresse e-mail non anonymisée dans le snapshot : ${path}.`);
    }
  });

  const recipeIds = new Set(snapshot.tables.recipes.map((row) => row.id));
  for (const row of snapshot.tables.recipe_versions) {
    if (!recipeIds.has(row.recipe_id)) throw new Error("Une version référence une recette absente du snapshot.");
  }
  for (const row of snapshot.tables.meal_plans) {
    if (row.recipe_id !== null && !recipeIds.has(row.recipe_id)) {
      throw new Error("Un repas planifié référence une recette absente du snapshot.");
    }
  }

  return snapshot;
}

export function materializeSnapshotForUser(snapshot, userId) {
  validateSnapshot(snapshot);
  return Object.fromEntries(
    SNAPSHOT_TABLES.map((table) => [
      table,
      snapshot.tables[table].map((row) => ({ ...row, [OWNER_FIELDS[table]]: userId })),
    ]),
  );
}
