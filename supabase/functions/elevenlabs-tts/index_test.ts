import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

import { handleElevenLabsTts } from "./index.ts";

Deno.test("elevenlabs-tts refuse les méthodes autres que POST", async () => {
  const response = await handleElevenLabsTts(new Request("http://localhost", { method: "GET" }));

  assertEquals(response.status, 405);
  assertEquals(response.headers.get("Allow"), "POST, OPTIONS");
});

Deno.test("elevenlabs-tts exige une authentification", async () => {
  const response = await handleElevenLabsTts(new Request("http://localhost", { method: "POST" }));

  assertEquals(response.status, 401);
  assertEquals(await response.json(), { error: "Authentication required" });
});
