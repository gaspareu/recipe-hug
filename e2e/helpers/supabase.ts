import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Client Supabase authentifié comme le compte de test, pour les E2E « écriture
 * réelle » : vérifier qu'une donnée a bien été créée puis la nettoyer. Utilise
 * la clé publishable (anon) + email/mot de passe du compte test — soumis à la
 * RLS (ne peut agir que sur les données du compte test).
 */
export async function createTestUserClient(): Promise<SupabaseClient> {
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;
  if (!url || !anonKey || !email || !password) {
    throw new Error('Variables manquantes (.env / .env.test) pour le client de test Supabase');
  }

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

/** Supprime les recettes du compte test dont le titre correspond (nettoyage). */
export async function deleteRecipesByTitle(client: SupabaseClient, title: string): Promise<void> {
  await client.from('recipes').delete().eq('title', title);
}
