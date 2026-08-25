// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260825102102_grant_authenticated_snapshot_table_privileges.sql", import.meta.url),
  "utf8",
);
const aiConfig = readFileSync(new URL("../../supabase/functions/_shared/ai-config.ts", import.meta.url), "utf8");
const manageAIKeys = readFileSync(new URL("../../supabase/functions/manage-ai-keys/index.ts", import.meta.url), "utf8");

const CONTENT_TABLES = [
  "user_culinary_preferences",
  "recipes",
  "recipe_versions",
  "meal_plans",
  "ai_conversations",
];

describe("privilèges de reconstruction Supabase", () => {
  it("accorde les opérations nécessaires sur les tables de contenu protégées par RLS", () => {
    expect(migration).toMatch(/GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE/i);
    expect(migration).toMatch(/TO\s+authenticated/i);

    for (const table of CONTENT_TABLES) {
      expect(migration).toContain(`public.${table}`);
    }
  });

  it("limite les tables sensibles aux vues et colonnes non secrètes", () => {
    expect(migration).toMatch(/GRANT\s+SELECT\s+ON\s+TABLE\s+public\.profiles_safe,\s*public\.user_ai_settings_safe/i);
    expect(migration).toMatch(/REVOKE\s+ALL\s+PRIVILEGES\s+ON\s+TABLE\s+public\.profiles\s+FROM\s+authenticated/i);
    expect(migration).toMatch(
      /GRANT\s+SELECT\s*\(id,\s*display_name,\s*avatar_url,\s*theme,\s*created_at,\s*updated_at\),\s*UPDATE\s*\(display_name,\s*avatar_url,\s*theme\)/i,
    );
    expect(migration).toMatch(
      /REVOKE\s+ALL\s+PRIVILEGES\s+ON\s+TABLE\s+public\.user_ai_settings\s+FROM\s+authenticated/i,
    );
    expect(migration).toMatch(
      /GRANT\s+SELECT\s*\(id,\s*user_id,\s*provider,\s*preferred_model,\s*agent_configs,\s*created_at,\s*updated_at\),\s*INSERT\s*\(id,\s*user_id,\s*provider,\s*preferred_model,\s*agent_configs,\s*created_at,\s*updated_at\)/i,
    );
    expect(migration).toMatch(/GRANT\s+SELECT\s+ON\s+TABLE\s+public\.recipe_shares/i);
    expect(migration).toMatch(/REVOKE\s+INSERT,\s*UPDATE,\s*DELETE\s+ON\s+TABLE\s+public\.recipe_shares/i);
    expect(migration).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE)[^;]*public\.recipe_shares/i);
  });

  it("réserve la lecture des clés IA aux edge functions avec service role", () => {
    expect(aiConfig).toContain('optionalEnv("SUPABASE_SERVICE_ROLE_KEY")');
    expect(aiConfig).toMatch(/getUserAISettings\(createSettingsClient\(supabaseClient\),\s*userId\)/);
    expect(manageAIKeys).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(manageAIKeys).toMatch(/const settingsClient = createClient\(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY/);
  });
});
