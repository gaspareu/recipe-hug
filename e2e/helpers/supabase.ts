import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// `createClient` instancie un RealtimeClient qui exige un `WebSocket` global,
// absent en Node < 21 (la CI tourne en Node 20). On ne se sert **jamais** du
// realtime ici (auth + REST uniquement) : un stub inoffensif suffit à éviter
// l'erreur « Node.js detected without native WebSocket support » au construct.
if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === 'undefined') {
  (globalThis as { WebSocket?: unknown }).WebSocket = class {
    close() {}
  };
}

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
