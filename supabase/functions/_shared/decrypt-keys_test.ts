import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { encryptValue, decryptValue, maskApiKey, decryptProviderKeys } from "./decrypt-keys.ts";

const TEST_SECRET = "test-encryption-secret-for-ci";

// Typical Anthropic key format
const ANTHROPIC_KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef-XXXXXX_XXXXXX_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX-AAAAAAAAAAAAAAAA";

// Other providers for comparison
const OPENAI_KEY = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABC";
const GEMINI_KEY = "AIzaSyAbcdefghijklmnopqrstuvwxyz012345678";

Deno.test("roundtrip: Anthropic key survives encrypt→decrypt", async () => {
  const encrypted = await encryptValue(ANTHROPIC_KEY, TEST_SECRET);
  const decrypted = await decryptValue(encrypted, TEST_SECRET);
  assertEquals(decrypted, ANTHROPIC_KEY, "Anthropic key corrupted after roundtrip");
});

Deno.test("roundtrip: OpenAI key survives encrypt→decrypt", async () => {
  const encrypted = await encryptValue(OPENAI_KEY, TEST_SECRET);
  const decrypted = await decryptValue(encrypted, TEST_SECRET);
  assertEquals(decrypted, OPENAI_KEY, "OpenAI key corrupted after roundtrip");
});

Deno.test("roundtrip: Gemini key survives encrypt→decrypt", async () => {
  const encrypted = await encryptValue(GEMINI_KEY, TEST_SECRET);
  const decrypted = await decryptValue(encrypted, TEST_SECRET);
  assertEquals(decrypted, GEMINI_KEY, "Gemini key corrupted after roundtrip");
});

Deno.test("roundtrip: multiple encryptions produce different ciphertexts (random IV)", async () => {
  const enc1 = await encryptValue(ANTHROPIC_KEY, TEST_SECRET);
  const enc2 = await encryptValue(ANTHROPIC_KEY, TEST_SECRET);
  // Different IVs → different ciphertexts
  if (enc1 === enc2) {
    throw new Error("Two encryptions produced identical ciphertext — IV may not be random");
  }
  // But both decrypt to the same value
  const dec1 = await decryptValue(enc1, TEST_SECRET);
  const dec2 = await decryptValue(enc2, TEST_SECRET);
  assertEquals(dec1, ANTHROPIC_KEY);
  assertEquals(dec2, ANTHROPIC_KEY);
});

Deno.test("roundtrip: key with special characters", async () => {
  const weirdKey = "sk-ant_key+with/special=chars&more!@#$%";
  const encrypted = await encryptValue(weirdKey, TEST_SECRET);
  const decrypted = await decryptValue(encrypted, TEST_SECRET);
  assertEquals(decrypted, weirdKey);
});

Deno.test("roundtrip: very long key (stress test spread operator)", async () => {
  // btoa(String.fromCharCode(...array)) can fail if array > ~125k elements
  // A 500-char key encrypted = ~530 bytes combined, well within limit
  const longKey = "sk-ant-" + "a".repeat(500);
  const encrypted = await encryptValue(longKey, TEST_SECRET);
  const decrypted = await decryptValue(encrypted, TEST_SECRET);
  assertEquals(decrypted, longKey);
});

Deno.test("decrypt with wrong secret throws", async () => {
  const encrypted = await encryptValue(ANTHROPIC_KEY, TEST_SECRET);
  let threw = false;
  try {
    await decryptValue(encrypted, "wrong-secret");
  } catch {
    threw = true;
  }
  assertEquals(threw, true, "Should throw on wrong secret");
});

Deno.test("encryptValue: refuse un secret vide (fail-closed au choke-point crypto)", async () => {
  let threw = false;
  try {
    await encryptValue(ANTHROPIC_KEY, "");
  } catch {
    threw = true;
  }
  assertEquals(threw, true, "Ne doit jamais chiffrer avec un secret vide");
});

Deno.test("decryptValue: refuse un secret vide", async () => {
  let threw = false;
  try {
    await decryptValue("nimporte", "");
  } catch {
    threw = true;
  }
  assertEquals(threw, true, "Ne doit jamais déchiffrer avec un secret vide");
});

Deno.test("decryptProviderKeys: fail-closed quand AI_KEYS_ENCRYPTION_SECRET absent", async () => {
  Deno.env.delete("AI_KEYS_ENCRYPTION_SECRET");
  const cipher = await encryptValue(ANTHROPIC_KEY, TEST_SECRET);
  let threw = false;
  try {
    await decryptProviderKeys({ anthropic: cipher });
  } catch {
    threw = true;
  }
  assertEquals(threw, true, "Doit refuser de renvoyer des clés sans secret de déchiffrement");
});

Deno.test("decryptProviderKeys: déchiffre les clés quand le secret est présent", async () => {
  Deno.env.set("AI_KEYS_ENCRYPTION_SECRET", TEST_SECRET);
  try {
    const cipher = await encryptValue(OPENAI_KEY, TEST_SECRET);
    const result = await decryptProviderKeys({ openai: cipher });
    assertEquals(result.openai, OPENAI_KEY);
  } finally {
    Deno.env.delete("AI_KEYS_ENCRYPTION_SECRET");
  }
});

Deno.test("maskApiKey works correctly", () => {
  assertEquals(maskApiKey(ANTHROPIC_KEY).startsWith("sk-a"), true);
  assertEquals(maskApiKey("short").includes("••••"), true);
});

Deno.test("base64 output contains only safe characters", async () => {
  const encrypted = await encryptValue(ANTHROPIC_KEY, TEST_SECRET);
  // Standard base64 charset
  const base64Regex = /^[A-Za-z0-9+/=]+$/;
  assertEquals(base64Regex.test(encrypted), true, `Encrypted output contains non-base64 chars: ${encrypted}`);
});
