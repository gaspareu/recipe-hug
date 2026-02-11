// Shared encryption/decryption utilities for API keys
const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12;

async function deriveKey(secret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", hash, { name: ALGORITHM }, false, ["encrypt", "decrypt"]);
}

export async function encryptValue(plaintext: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoded);
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptValue(encrypted: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);
  const decrypted = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

/**
 * Decrypt all provider API keys from the database.
 * Falls back to plaintext if decryption fails (backward compatibility).
 */
export async function decryptProviderKeys(
  keys: Record<string, string>
): Promise<Record<string, string>> {
  const secret = Deno.env.get("AI_KEYS_ENCRYPTION_SECRET");
  if (!secret) {
    console.warn("[decrypt] No AI_KEYS_ENCRYPTION_SECRET set, returning raw keys");
    return keys;
  }

  const result: Record<string, string> = {};
  for (const [provider, key] of Object.entries(keys)) {
    if (key && typeof key === "string") {
      try {
        const decrypted = await decryptValue(key, secret);
        result[provider] = decrypted;
        console.log(`[decrypt] ${provider}: OK (decrypted, length=${decrypted.length}, prefix=${decrypted.substring(0, 6)}...)`);
      } catch (err) {
        // Fallback to plaintext (not yet encrypted)
        result[provider] = key;
        console.warn(`[decrypt] ${provider}: FALLBACK to plaintext (decrypt failed: ${err instanceof Error ? err.message : "unknown"}), length=${key.length}, prefix=${key.substring(0, 6)}...`);
      }
    }
  }
  return result;
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.substring(0, 4) + "••••" + key.substring(key.length - 4);
}
