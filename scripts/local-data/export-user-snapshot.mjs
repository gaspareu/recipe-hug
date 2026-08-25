import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { assertPrivateEnvFile, assertSecureSourceUrl, enabled, requiredEnv } from "./runtime-utils.mjs";
import { assertRowsBelongToUser, createSanitizedSnapshot } from "./snapshot-lib.mjs";

const PAGE_SIZE = 500;
const outputPath = resolve(process.cwd(), ".local-data/user-snapshot.json");

async function authenticateSource() {
  const url = assertSecureSourceUrl(requiredEnv("SUPABASE_SOURCE_URL"));
  const publishableKey = requiredEnv("SUPABASE_SOURCE_PUBLISHABLE_KEY");
  const accessToken = process.env.SUPABASE_SOURCE_ACCESS_TOKEN?.trim();
  const client = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...(accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {}),
  });

  if (accessToken) {
    const { data, error } = await client.auth.getUser(accessToken);
    if (error || !data.user) throw new Error(`JWT source invalide ou expiré : ${error?.message ?? "utilisateur absent"}.`);
    return { client, user: data.user };
  }

  const email = requiredEnv("SUPABASE_SOURCE_EMAIL");
  const password = requiredEnv("SUPABASE_SOURCE_PASSWORD");
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`Connexion source impossible : ${error?.message ?? "utilisateur absent"}.`);
  return { client, user: data.user };
}

async function readAll(client, relation) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client.from(relation).select("*").order("id").range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Lecture de ${relation} impossible : ${error.message}.`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

async function main() {
  await assertPrivateEnvFile();
  const includeConversations = enabled("SUPABASE_SNAPSHOT_INCLUDE_CONVERSATIONS");
  const { client, user } = await authenticateSource();

  const [profiles, aiSettings, preferences, recipes, versions, mealPlans, conversations] = await Promise.all([
    readAll(client, "profiles_safe"),
    readAll(client, "user_ai_settings_safe"),
    readAll(client, "user_culinary_preferences"),
    readAll(client, "recipes"),
    readAll(client, "recipe_versions"),
    readAll(client, "meal_plans"),
    includeConversations ? readAll(client, "ai_conversations") : Promise.resolve([]),
  ]);

  const rawTables = {
    profiles,
    user_ai_settings: aiSettings,
    user_culinary_preferences: preferences,
    recipes,
    recipe_versions: versions,
    meal_plans: mealPlans,
    ai_conversations: conversations,
  };
  assertRowsBelongToUser(rawTables, user.id);
  const snapshot = createSanitizedSnapshot(rawTables, { includeConversations });

  await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
  await chmod(dirname(outputPath), 0o700);
  const temporaryPath = `${outputPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, outputPath);

  const counts = Object.fromEntries(Object.entries(snapshot.tables).map(([table, rows]) => [table, rows.length]));
  console.log(`Snapshot pseudonymisé créé : ${outputPath}`);
  console.log(counts);
  console.log("Les identifiants détectés, secrets, images distantes et identifiants Cookidoo ont été supprimés ou remplacés.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
