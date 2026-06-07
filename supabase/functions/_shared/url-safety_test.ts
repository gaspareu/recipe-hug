import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { isUrlSafe } from "./url-safety.ts";

// --- URLs publiques HTTPS : autorisées ---
Deno.test("accepte une URL HTTPS publique classique", () => {
  assert(isUrlSafe("https://example.com/image.jpg"));
});

Deno.test("accepte une URL HTTPS publique avec sous-domaine et port", () => {
  assert(isUrlSafe("https://cdn.recipes.example.com:443/photos/abc.png"));
});

Deno.test("accepte une IP publique en HTTPS", () => {
  assert(isUrlSafe("https://8.8.8.8/img.jpg"));
});

// --- Protocole : seul HTTPS est accepté ---
Deno.test("refuse le HTTP non chiffré", () => {
  assertEquals(isUrlSafe("http://example.com/image.jpg"), false);
});

Deno.test("refuse les protocoles non-HTTP (file, ftp, data)", () => {
  assertEquals(isUrlSafe("file:///etc/passwd"), false);
  assertEquals(isUrlSafe("ftp://example.com/x"), false);
  assertEquals(isUrlSafe("data:text/plain;base64,SGk="), false);
});

// --- Loopback / localhost ---
Deno.test("refuse localhost", () => {
  assertEquals(isUrlSafe("https://localhost/admin"), false);
});

Deno.test("refuse la loopback IPv4 127.0.0.1", () => {
  assertEquals(isUrlSafe("https://127.0.0.1/"), false);
});

Deno.test("refuse la loopback IPv6 ::1 (forme compacte et étendue)", () => {
  assertEquals(isUrlSafe("https://[::1]/"), false);
  assertEquals(isUrlSafe("https://[0:0:0:0:0:0:0:1]/"), false);
});

Deno.test("refuse les formes obscurcies de 127.0.0.1 (normalisées par l'API URL)", () => {
  // L'API URL normalise ces représentations vers 127.0.0.1.
  assertEquals(isUrlSafe("https://0x7f.0.0.1/"), false);
  assertEquals(isUrlSafe("https://2130706433/"), false);
});

Deno.test("refuse localhost insensible à la casse", () => {
  assertEquals(isUrlSafe("https://LocalHost/admin"), false);
});

// --- Métadonnées cloud (vecteur SSRF classique) ---
Deno.test("refuse l'endpoint de métadonnées cloud 169.254.169.254", () => {
  assertEquals(isUrlSafe("https://169.254.169.254/latest/meta-data/"), false);
});

// --- Plages d'IP privées RFC 1918 ---
Deno.test("refuse la plage 10.0.0.0/8", () => {
  assertEquals(isUrlSafe("https://10.0.0.1/"), false);
  assertEquals(isUrlSafe("https://10.255.255.255/"), false);
});

Deno.test("refuse la plage 172.16.0.0/12", () => {
  assertEquals(isUrlSafe("https://172.16.0.1/"), false);
  assertEquals(isUrlSafe("https://172.31.255.255/"), false);
});

Deno.test("accepte 172.x hors de la plage privée (172.15 et 172.32)", () => {
  assert(isUrlSafe("https://172.15.0.1/"));
  assert(isUrlSafe("https://172.32.0.1/"));
});

Deno.test("refuse la plage 192.168.0.0/16", () => {
  assertEquals(isUrlSafe("https://192.168.1.1/"), false);
});

Deno.test("refuse la plage link-local 169.254.0.0/16", () => {
  assertEquals(isUrlSafe("https://169.254.10.20/"), false);
});

// --- Entrées invalides ---
Deno.test("refuse une chaîne qui n'est pas une URL", () => {
  assertEquals(isUrlSafe("pas une url"), false);
});

Deno.test("refuse une chaîne vide", () => {
  assertEquals(isUrlSafe(""), false);
});
