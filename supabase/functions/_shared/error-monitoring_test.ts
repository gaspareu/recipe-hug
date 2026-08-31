import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { captureEdgeException, initializeEdgeErrorMonitoring } from "./error-monitoring.ts";

Deno.test("error-monitoring reste inactif quand le DSN Sentry est absent", async () => {
  assertEquals(initializeEdgeErrorMonitoring(""), false);
  await captureEdgeException("home-assistant", "unhandled_error");
});
