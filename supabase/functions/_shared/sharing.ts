// ===== Règles pures du partage de recettes =====
//
// Logique de sécurité partagée par les fonctions `share-recipe` et
// `claim-shares`. Isolée ici pour être testable sans démarrer de serveur ni
// dépendre de Supabase (voir sharing_test.ts).

/** Ligne de partage en attente, insérée dans `recipe_shares`. */
export interface PendingShareRow {
  sender_id: string;
  recipient_identifier: string;
  identifier_type: string;
  recipe_snapshot: Record<string, unknown>;
  status: "pending";
}

export interface ShareResult {
  shareRow: PendingShareRow;
  response: { status: "pending"; message: string; shareUrl: string };
}

/**
 * Construit le partage à enregistrer et la réponse renvoyée à l'expéditeur.
 *
 * Le partage est **toujours** créé en `pending`, quel que soit le destinataire :
 * le destinataire récupère la recette lui-même via `claim-shares` (avec
 * consentement, après vérification de son identifiant). Cela ferme deux failles :
 *  - l'injection non sollicitée d'une recette dans le compte d'autrui ;
 *  - l'oracle d'énumération de comptes (la réponse ne dépend plus de l'existence
 *    du destinataire — même statut, même message dans tous les cas).
 */
export function buildShareResult(input: {
  senderId: string;
  identifier: string;
  identifierType: string;
  snapshot: Record<string, unknown>;
  senderName: string;
  appUrl: string;
}): ShareResult {
  const recipeTitle = typeof input.snapshot.title === "string" ? input.snapshot.title : "";
  const params = new URLSearchParams();
  if (input.senderName) params.set("shared_by", input.senderName);
  if (recipeTitle) params.set("recipe", recipeTitle);
  const shareUrl = `${input.appUrl}/auth?${params.toString()}`;

  return {
    shareRow: {
      sender_id: input.senderId,
      recipient_identifier: input.identifier,
      identifier_type: input.identifierType,
      recipe_snapshot: input.snapshot,
      status: "pending",
    },
    response: {
      status: "pending",
      message: "Partage enregistré : le destinataire le recevra à sa prochaine connexion.",
      shareUrl,
    },
  };
}

/**
 * Un partage en attente ne correspond à l'utilisateur que si l'identifiant visé
 * (email ou téléphone) est **vérifié** sur son compte. Sans cette exigence, un
 * compte créé avec l'email/téléphone d'autrui (non confirmé) pourrait réclamer
 * les recettes qui lui étaient destinées (usurpation d'identité).
 */
export function shareMatchesVerifiedIdentifier(
  share: { identifier_type: string; recipient_identifier: string },
  user: { email: string | null; emailConfirmed: boolean; phone: string | null; phoneConfirmed: boolean },
): boolean {
  if (share.identifier_type === "email" && user.email && user.emailConfirmed) {
    return share.recipient_identifier.toLowerCase() === user.email.toLowerCase();
  }
  if (share.identifier_type === "phone" && user.phone && user.phoneConfirmed) {
    return share.recipient_identifier === user.phone;
  }
  return false;
}
