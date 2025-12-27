// Gestion du user_id anonyme pour le MVP
// Ce fichier sera remplacé par l'auth Supabase plus tard

const STORAGE_KEY = 'anonymous_user_id';

export function getAnonymousUserId(): string {
  let userId = localStorage.getItem(STORAGE_KEY);
  
  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, userId);
  }
  
  return userId;
}
