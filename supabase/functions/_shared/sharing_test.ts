import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { buildShareResult, shareMatchesVerifiedIdentifier } from "./sharing.ts";

// ============================================================
// buildShareResult — partage toujours « pending », réponse uniforme
// ============================================================

Deno.test("buildShareResult: produit toujours un partage 'pending' (jamais d'insertion directe dans le compte d'autrui)", () => {
  const { shareRow, response } = buildShareResult({
    senderId: "s1",
    identifier: "a@b.co",
    identifierType: "email",
    snapshot: { title: "Tarte" },
    senderName: "Alice",
    appUrl: "https://app.test",
  });
  assertEquals(shareRow.status, "pending");
  assertEquals(response.status, "pending");
  assertEquals(shareRow.sender_id, "s1");
  assertEquals(shareRow.recipient_identifier, "a@b.co");
  assertEquals(shareRow.identifier_type, "email");
});

Deno.test("buildShareResult: réponse uniforme quel que soit le destinataire (pas d'oracle d'énumération de comptes)", () => {
  const base = {
    senderId: "s1",
    identifierType: "email",
    snapshot: { title: "Tarte" },
    senderName: "Alice",
    appUrl: "https://app.test",
  };
  const a = buildShareResult({ ...base, identifier: "existe@b.co" });
  const b = buildShareResult({ ...base, identifier: "inconnu@b.co" });
  // Rien dans la réponse ne doit distinguer un compte existant d'un compte absent.
  assertEquals(a.response.status, b.response.status);
  assertEquals(a.response.message, b.response.message);
  assert(!("claimed" in a.response), "la réponse ne doit pas révéler que la recette a été livrée directement");
});

Deno.test("buildShareResult: le shareUrl encode l'expéditeur et le titre", () => {
  const { response } = buildShareResult({
    senderId: "s1",
    identifier: "a@b.co",
    identifierType: "email",
    snapshot: { title: "Tarte aux pommes" },
    senderName: "Alice",
    appUrl: "https://app.test",
  });
  assert(response.shareUrl.startsWith("https://app.test/auth?"), response.shareUrl);
  const url = new URL(response.shareUrl);
  assertEquals(url.searchParams.get("shared_by"), "Alice");
  assertEquals(url.searchParams.get("recipe"), "Tarte aux pommes");
});

// ============================================================
// shareMatchesVerifiedIdentifier — exige un identifiant VÉRIFIÉ
// ============================================================

Deno.test("shareMatchesVerifiedIdentifier: email vérifié et correspondant → true (insensible à la casse)", () => {
  assertEquals(
    shareMatchesVerifiedIdentifier(
      { identifier_type: "email", recipient_identifier: "USER@b.co" },
      { email: "user@b.co", emailConfirmed: true, phone: null, phoneConfirmed: false },
    ),
    true,
  );
});

Deno.test("shareMatchesVerifiedIdentifier: email NON vérifié → false même si l'email correspond", () => {
  // Cœur du correctif : un compte dont l'email n'est pas confirmé ne peut pas
  // réclamer les recettes adressées à cet email (usurpation d'identité).
  assertEquals(
    shareMatchesVerifiedIdentifier(
      { identifier_type: "email", recipient_identifier: "user@b.co" },
      { email: "user@b.co", emailConfirmed: false, phone: null, phoneConfirmed: false },
    ),
    false,
  );
});

Deno.test("shareMatchesVerifiedIdentifier: téléphone vérifié et correspondant → true", () => {
  assertEquals(
    shareMatchesVerifiedIdentifier(
      { identifier_type: "phone", recipient_identifier: "+33600000000" },
      { email: null, emailConfirmed: false, phone: "+33600000000", phoneConfirmed: true },
    ),
    true,
  );
});

Deno.test("shareMatchesVerifiedIdentifier: téléphone NON vérifié → false même s'il correspond", () => {
  assertEquals(
    shareMatchesVerifiedIdentifier(
      { identifier_type: "phone", recipient_identifier: "+33600000000" },
      { email: null, emailConfirmed: false, phone: "+33600000000", phoneConfirmed: false },
    ),
    false,
  );
});

Deno.test("shareMatchesVerifiedIdentifier: email vérifié mais différent → false", () => {
  assertEquals(
    shareMatchesVerifiedIdentifier(
      { identifier_type: "email", recipient_identifier: "autre@b.co" },
      { email: "user@b.co", emailConfirmed: true, phone: null, phoneConfirmed: false },
    ),
    false,
  );
});
