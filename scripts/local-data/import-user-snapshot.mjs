import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { assertLocalUrl, assertPrivateEnvFile, requiredEnv } from "./runtime-utils.mjs";
import { materializeSnapshotForUser, OWNER_FIELDS, SNAPSHOT_TABLES, validateSnapshot } from "./snapshot-lib.mjs";

const snapshotPath = resolve(process.cwd(), ".local-data/user-snapshot.json");
const INSERT_ORDER = [
  "user_ai_settings",
  "user_culinary_preferences",
  "recipes",
  "recipe_versions",
  "meal_plans",
  "ai_conversations",
];
const PREFLIGHT_TABLES = [...INSERT_ORDER, "recipe_shares"];
const READ_RELATIONS = {
  profiles: "profiles_safe",
  user_ai_settings: "user_ai_settings_safe",
};
async function authenticateLocal() {
  const url = assertLocalUrl(requiredEnv("SUPABASE_LOCAL_URL"));
  const publishableKey = requiredEnv("SUPABASE_LOCAL_PUBLISHABLE_KEY");
  const email = requiredEnv("SUPABASE_LOCAL_EMAIL");
  const password = requiredEnv("SUPABASE_LOCAL_PASSWORD");
  const client = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const signIn = await client.auth.signInWithPassword({ email, password });
  if (!signIn.error && signIn.data.user) return { client, user: signIn.data.user };

  const signUp = await client.auth.signUp({ email, password, options: { data: { display_name: "Utilisateur local" } } });
  if (signUp.error || !signUp.data.user || !signUp.data.session) {
    throw new Error(
      `Création du compte local impossible : ${signUp.error?.message ?? "confirmation e-mail active ou session absente"}. ` +
        "Crée le compte dans le Studio local puis relance l'import.",
    );
  }
  return { client, user: signUp.data.user };
}

async function countRows(client, table, ownerField, userId) {
  const { count, error } = await client
    .from(READ_RELATIONS[table] ?? table)
    .select("*", { count: "exact", head: true })
    .eq(ownerField, userId);
  if (error) throw new Error(`Comptage de ${table} impossible : ${error.message}.`);
  return count ?? 0;
}

async function assertEmptyTarget(client, userId) {
  for (const table of PREFLIGHT_TABLES) {
    const count = await countRows(client, table, OWNER_FIELDS[table], userId);
    if (count > 0) {
      throw new Error(
        `Import refusé : le compte local contient déjà ${count} ligne(s) dans ${table}. ` +
          "Utilise un compte local neuf ou exécute `supabase db reset --local`.",
      );
    }
  }
}

async function insertRows(client, table, rows) {
  for (let index = 0; index < rows.length; index += 250) {
    const chunk = rows.slice(index, index + 250);
    if (chunk.length === 0) continue;
    const { error } = await client.from(table).insert(chunk);
    if (error) throw new Error(`Import de ${table} impossible : ${error.message}.`);
  }
}

async function main() {
  await assertPrivateEnvFile();
  let serializedSnapshot;
  try {
    serializedSnapshot = await readFile(snapshotPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error("Snapshot absent. Exécute d'abord `npm run db:snapshot:export`.");
    }
    throw error;
  }
  const snapshot = validateSnapshot(JSON.parse(serializedSnapshot));
  const { client, user } = await authenticateLocal();
  await assertEmptyTarget(client, user.id);
  const tables = materializeSnapshotForUser(snapshot, user.id);

  const profile = tables.profiles[0];
  if (profile) {
    const updates = {
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      theme: profile.theme,
    };
    const { error } = await client.from("profiles").update(updates).eq("id", user.id);
    if (error) throw new Error(`Mise à jour du profil local impossible : ${error.message}.`);
  }

  for (const table of INSERT_ORDER) await insertRows(client, table, tables[table]);

  const counts = {};
  for (const table of SNAPSHOT_TABLES) {
    const actual = await countRows(client, table, OWNER_FIELDS[table], user.id);
    const expected = tables[table].length;
    if (actual !== expected) throw new Error(`Vérification de ${table} échouée : ${actual} ligne(s), ${expected} attendue(s).`);
    counts[table] = actual;
  }

  console.log("Snapshot importé et vérifié dans Supabase local.");
  console.log(counts);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
