import { stat } from "node:fs/promises";
import { resolve } from "node:path";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizedHostname(url) {
  return url.hostname.replace(/^\[|\]$/g, "");
}

export function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variable ${name} manquante. Consulte docs/LOCAL_DATA.md.`);
  return value;
}

export function enabled(name) {
  return process.env[name]?.trim().toLowerCase() === "true";
}

export function assertSecureSourceUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" && !LOOPBACK_HOSTS.has(normalizedHostname(url))) {
    throw new Error("Export refusé : SUPABASE_SOURCE_URL doit utiliser HTTPS, sauf pour une source loopback.");
  }
  return url.toString().replace(/\/$/, "");
}

export function assertLocalUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (!LOOPBACK_HOSTS.has(normalizedHostname(url))) {
    throw new Error("Import refusé : SUPABASE_LOCAL_URL doit pointer vers localhost.");
  }
  return url.toString().replace(/\/$/, "");
}

export async function assertPrivateEnvFile(path = resolve(process.cwd(), ".env.local-data")) {
  let file;
  try {
    file = await stat(path);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw error;
  }

  if (process.platform !== "win32" && (file.mode & 0o077) !== 0) {
    throw new Error("Permissions trop larges sur .env.local-data. Exécute `chmod 600 .env.local-data` puis relance la commande.");
  }
}
