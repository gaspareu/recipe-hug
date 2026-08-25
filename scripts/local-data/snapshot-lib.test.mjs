// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assertLocalUrl, assertSecureSourceUrl } from "./runtime-utils.mjs";
import {
  assertRowsBelongToUser,
  createSanitizedSnapshot,
  materializeSnapshotForUser,
  OWNER_PLACEHOLDER,
  validateSnapshot,
} from "./snapshot-lib.mjs";

const SOURCE_USER = "11111111-1111-4111-8111-111111111111";
const RECIPE_ID = "22222222-2222-4222-8222-222222222222";

function sourceTables() {
  return {
    profiles: [{ id: SOURCE_USER, display_name: "Utilisateur source", avatar_url: "https://prod/image.jpg", theme: "dark" }],
    user_ai_settings: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        user_id: SOURCE_USER,
        provider: "anthropic",
        preferred_model: "claude-test",
        agent_configs: {},
      },
    ],
    user_culinary_preferences: [],
    recipes: [
      {
        id: RECIPE_ID,
        user_id: SOURCE_USER,
        title: "Soupe",
        ingredients: [],
        steps: [],
        source_image_url: "https://prod/recipe.jpg",
        cookidoo_recipe_id: "production-id",
      },
    ],
    recipe_versions: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        user_id: SOURCE_USER,
        recipe_id: RECIPE_ID,
        version_number: 1,
        title: "Soupe",
        ingredients: [],
        steps: [],
      },
    ],
    meal_plans: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        user_id: SOURCE_USER,
        recipe_id: RECIPE_ID,
        week_start: "2026-08-24",
        day_of_week: 1,
        meal_type: "dinner",
      },
    ],
    ai_conversations: [],
    recipe_shares: [],
  };
}

function idFactory() {
  let index = 0;
  return () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++index).padStart(12, "0")}`;
}

describe("snapshot utilisateur Supabase", () => {
  it("remplace les identifiants de production tout en conservant les relations", () => {
    const snapshot = createSanitizedSnapshot(sourceTables(), { createId: idFactory(), generatedAt: "2026-08-25T00:00:00.000Z" });

    expect(snapshot.tables.profiles[0]).toMatchObject({
      id: OWNER_PLACEHOLDER,
      display_name: "Utilisateur local",
      avatar_url: null,
    });
    expect(snapshot.tables.recipes[0].id).not.toBe(RECIPE_ID);
    expect(snapshot.tables.recipes[0].user_id).toBe(OWNER_PLACEHOLDER);
    expect(snapshot.tables.recipes[0].source_image_url).toBeNull();
    expect(snapshot.tables.recipes[0].cookidoo_recipe_id).toBeNull();
    expect(snapshot.tables.recipe_versions[0].recipe_id).toBe(snapshot.tables.recipes[0].id);
    expect(snapshot.tables.meal_plans[0].recipe_id).toBe(snapshot.tables.recipes[0].id);
    expect(JSON.stringify(snapshot)).not.toContain(SOURCE_USER);
    expect(JSON.stringify(snapshot)).not.toContain(RECIPE_ID);
  });

  it("exclut les conversations par défaut", () => {
    const raw = sourceTables();
    raw.ai_conversations = [{ id: "conversation", user_id: SOURCE_USER, title: "Privé", messages: [] }];

    const snapshot = createSanitizedSnapshot(raw, { createId: idFactory() });
    expect(snapshot.tables.ai_conversations).toEqual([]);
    expect(snapshot.tables.recipe_shares).toEqual([]);
  });

  it("refuse l'ajout manuel d'un partage", () => {
    const snapshot = createSanitizedSnapshot(sourceTables(), { createId: idFactory() });
    snapshot.tables.recipe_shares.push({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-999999999999",
      sender_id: OWNER_PLACEHOLDER,
      recipient_id: null,
      recipient_identifier: "destinataire@example.invalid",
      claimed_at: null,
      identifier_type: "email",
      recipe_snapshot: {},
      status: "pending",
    });
    expect(() => validateSnapshot(snapshot)).toThrow(/partages ne sont pas autorisés/);
  });

  it("nettoie aussi les relations présentes dans les conversations explicitement incluses", () => {
    const raw = sourceTables();
    const oldConversationId = "66666666-6666-4666-8666-666666666666";
    raw.ai_conversations = [
      {
        id: oldConversationId,
        user_id: SOURCE_USER,
        title: "Soupe",
        messages: [
          {
            recipe_id: RECIPE_ID,
            user_id: SOURCE_USER,
            conversation_id: oldConversationId,
            content: `Ouvre /recipes/${RECIPE_ID}`,
            imageUrl: "https://prod/image.jpg",
            attachment: { type: "image", source: { type: "base64", data: "contenu-image" } },
            embedded: { media_type: "application/octet-stream", mime_type: "image/png", data: "iVBORw0KGgo" },
          },
          { content: "Aperçu intégré: data:image/png;base64,contenu-image" },
        ],
        extracted_recipe: { id: RECIPE_ID },
      },
    ];

    const snapshot = createSanitizedSnapshot(raw, { createId: idFactory(), includeConversations: true });
    const conversation = snapshot.tables.ai_conversations[0];
    expect(conversation.messages[0].recipe_id).toBe(snapshot.tables.recipes[0].id);
    expect(conversation.messages[0].user_id).toBe(OWNER_PLACEHOLDER);
    expect(conversation.messages[0].conversation_id).toBe(conversation.id);
    expect(conversation.messages[0].content).toBe(`Ouvre /recipes/${snapshot.tables.recipes[0].id}`);
    expect(conversation.messages[0].imageUrl).toBeNull();
    expect(conversation.messages[0].attachment).toBeNull();
    expect(conversation.messages[0].embedded).toBeNull();
    expect(conversation.messages[1].content).toBeNull();
    expect(conversation.extracted_recipe.id).toBe(snapshot.tables.recipes[0].id);
    expect(JSON.stringify(snapshot)).not.toContain(oldConversationId);
  });

  it("refuse une fuite RLS provenant d'un autre utilisateur", () => {
    const raw = sourceTables();
    raw.recipes.push({ ...raw.recipes[0], id: "other", user_id: "99999999-9999-4999-8999-999999999999" });
    expect(() => assertRowsBelongToUser(raw, SOURCE_USER)).toThrow(/RLS/);
  });

  it("refuse les secrets et les adresses e-mail non anonymisées", () => {
    const snapshot = createSanitizedSnapshot(sourceTables(), { createId: idFactory() });
    snapshot.tables.recipes[0].ai_summary = "Contact: personne@example.com";
    expect(() => validateSnapshot(snapshot)).toThrow(/e-mail non anonymisée/);

    snapshot.tables.recipes[0].ai_summary = "sk-ant-abcdefghijklmnopqrstuvwxyz";
    expect(() => validateSnapshot(snapshot)).toThrow(/secret/);
  });

  it("remplace le propriétaire uniquement au moment de l'import local", () => {
    const snapshot = createSanitizedSnapshot(sourceTables(), { createId: idFactory() });
    const localUser = "77777777-7777-4777-8777-777777777777";
    const tables = materializeSnapshotForUser(snapshot, localUser);

    expect(tables.profiles[0].id).toBe(localUser);
    expect(tables.recipes[0].user_id).toBe(localUser);
    expect(tables.recipe_versions[0].user_id).toBe(localUser);
    expect(snapshot.tables.recipes[0].user_id).toBe(OWNER_PLACEHOLDER);
  });

  it("refuse un snapshot modifié avec une colonne ou une image distante", () => {
    const snapshot = createSanitizedSnapshot(sourceTables(), { createId: idFactory() });
    snapshot.tables.recipes[0].colonne_inattendue = "valeur";
    expect(() => validateSnapshot(snapshot)).toThrow(/Champs non autorisés/);

    delete snapshot.tables.recipes[0].colonne_inattendue;
    snapshot.tables.recipes[0].source_image_url = "https://prod/image.jpg";
    expect(() => validateSnapshot(snapshot)).toThrow(/image ou un identifiant Cookidoo/);
  });

  it("refuse une image encodée dissimulée dans un texte", () => {
    const raw = sourceTables();
    raw.ai_conversations = [
      {
        id: "66666666-6666-4666-8666-666666666666",
        user_id: SOURCE_USER,
        title: "Soupe",
        messages: [],
      },
    ];
    const snapshot = createSanitizedSnapshot(raw, { createId: idFactory(), includeConversations: true });
    snapshot.tables.ai_conversations[0].messages = [{ content: "préfixe data:image/png;base64,image" }];
    expect(() => validateSnapshot(snapshot)).toThrow(/Image encodée/);
  });

  it("refuse un conteneur image ajouté manuellement avec un type MIME", () => {
    const raw = sourceTables();
    raw.ai_conversations = [
      {
        id: "66666666-6666-4666-8666-666666666666",
        user_id: SOURCE_USER,
        title: "Soupe",
        messages: [],
      },
    ];
    const snapshot = createSanitizedSnapshot(raw, { createId: idFactory(), includeConversations: true });
    snapshot.tables.ai_conversations[0].messages = [
      { attachment: { mimeType: "image/jpeg", data: "contenu-encodé" } },
    ];
    expect(() => validateSnapshot(snapshot)).toThrow(/Conteneur image/);
  });
});

describe("URLs du snapshot local", () => {
  it("refuse une source HTTP distante mais autorise HTTPS", () => {
    expect(() => assertSecureSourceUrl("http://example.com")).toThrow(/HTTPS/);
    expect(assertSecureSourceUrl("https://example.com/")).toBe("https://example.com");
  });

  it("accepte les trois formes loopback pour l'import", () => {
    expect(assertLocalUrl("http://localhost:54321/")).toBe("http://localhost:54321");
    expect(assertLocalUrl("http://127.0.0.1:54321/")).toBe("http://127.0.0.1:54321");
    expect(assertLocalUrl("http://[::1]:54321/")).toBe("http://[::1]:54321");
    expect(() => assertLocalUrl("https://example.com")).toThrow(/localhost/);
  });
});
