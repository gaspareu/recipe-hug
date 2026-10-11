import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { boundedCookidooFetch } from "./operation.ts";
Deno.test("un login tardif ne repousse pas le délai de création", async () => {
  let clock = 0, calls = 0;
  const implementation: typeof fetch = () => {
    calls++;
    clock = 100;
    return Promise.resolve(new Response("ok"));
  };
  const bounded = boundedCookidooFetch(
    implementation,
    90,
    undefined,
    () => clock,
  );
  await bounded("https://cookidoo.fr/profile/fr-FR/login");
  await assertRejects(
    () =>
      bounded("https://cookidoo.fr/created-recipes/fr-FR", { method: "POST" }),
    Error,
    "export_deadline",
  );
  assertEquals(calls, 1);
});
Deno.test("une réservation devenue inconnue interdit une écriture distante", async () => {
  let calls = 0;
  const bounded = boundedCookidooFetch(
    () => {
      calls++;
      return Promise.resolve(new Response());
    },
    100,
    () => Promise.reject(new Error("reservation_lost")),
    () => 0,
  );
  await assertRejects(
    () =>
      bounded("https://cookidoo.fr/created-recipes/fr-FR/r1", {
        method: "PATCH",
      }),
    Error,
    "reservation_lost",
  );
  assertEquals(calls, 0);
});
Deno.test("une vérification de réservation lente ne permet pas de dépasser le délai", async () => {
  let clock = 0, calls = 0;
  const bounded = boundedCookidooFetch(
    () => {
      calls++;
      return Promise.resolve(new Response());
    },
    90,
    () => {
      clock = 100;
      return Promise.resolve();
    },
    () => clock,
  );
  await assertRejects(
    () =>
      bounded("https://cookidoo.fr/created-recipes/fr-FR", { method: "POST" }),
    Error,
    "export_deadline",
  );
  assertEquals(calls, 0);
});
