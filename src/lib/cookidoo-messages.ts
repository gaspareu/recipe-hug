/** Messages produit : aucun détail technique ni message brut du serveur. */
export const COOKIDOO_ERRORS: Record<string, string> = {
  export_failed: 'Votre version adaptée est conservée. Vous pouvez réessayer l’envoi sans la préparer à nouveau.',
  auth_failed: 'Vérifiez vos identifiants Cookidoo dans votre profil.',
  decrypt_failed: 'Reconnectez votre compte Cookidoo depuis votre profil.',
  not_configured: 'Connectez votre compte Cookidoo pour envoyer cette recette.',
  ip_blocked: 'Cookidoo est momentanément indisponible. Votre version adaptée est conservée.',
  rate_limited: 'Cookidoo reçoit trop de demandes. Votre version adaptée est conservée. Vous pouvez tenter un nouvel envoi dans une minute (délai indicatif).',
  preparation_rate_limited: 'La limite d’adaptation est atteinte. Réessayez plus tard. Les versions déjà préparées restent disponibles.',
  source_changed: 'La recette a changé. Actualisez la version Cookidoo avant de l’envoyer.',
  preview_expired: 'Actualisez l’aperçu avant de confirmer l’envoi. La version adaptée reste conservée.',
  preparation_required: 'Préparez une version Cookidoo avant de l’envoyer.',
  invalid_source: 'Des ingrédients ou des étapes sont incomplets dans cette recette. Complétez-les avant l’adaptation.',
  invalid_water: 'Indiquez une quantité d’eau comprise entre 100 et 2 000 ml.',
  invalid_payload: 'Cette version ne peut pas encore être envoyée. Vérifiez les informations de l’adaptation.',
  adaptation_failed: 'L’adaptation n’a pas abouti. Votre recette est conservée et aucun envoi n’a été effectué.',
  remote_changed: 'Cette recette a été modifiée dans Cookidoo. Vérifiez la version proposée avant de remplacer son contenu.',
  destination_missing: 'La recette a été supprimée de Cookidoo. Confirmez la création d’une nouvelle recette.',
  partial_created: 'Une recette incomplète reste sur Cookidoo. Ouvrez-la pour la supprimer avant un nouvel envoi.',
  connection_unknown: 'La connexion a été interrompue. Actualisez l’état avant de relancer une opération.',
  result_unknown: 'Le résultat de l’envoi n’est pas encore confirmé. Consultez Cookidoo avant de relancer.',
  backend_updating: 'Le service d’adaptation est en cours de mise à jour. Réessayez dans quelques instants.',
  not_found: 'Cette recette n’est plus disponible.',
};
export function cookidooErrorMessage(code?: string | null, retryAt?: string | null, now = Date.now()): string {
  if (code === 'preparation_rate_limited' && retryAt && Number.isFinite(Date.parse(retryAt))) {
    const remaining = Math.max(0, Math.ceil((Date.parse(retryAt) - now) / 1000));
    if (!remaining) return 'Vous pouvez réessayer l’adaptation maintenant. Les versions déjà préparées restent disponibles.';
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;
    const delay = hours ? `${hours} h ${minutes} min` : minutes ? `${minutes} min ${seconds} s` : `${seconds} s`;
    const date = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(retryAt));
    return `Limite d’adaptation atteinte. Nouvelle tentative dans ${delay}, le ${date}. Les versions déjà préparées restent disponibles.`;
  }
  return COOKIDOO_ERRORS[code ?? ''] ?? 'Le service est momentanément indisponible. Votre recette est conservée. Réessayez plus tard.';
}
export const COOKIDOO_WARNINGS: Record<string, string> = {
  image_not_transferred: 'La photo n’a pas pu être transférée.',
  title_not_updated: 'Le titre n’a pas pu être mis à jour.',
  steps_not_guided: 'Certaines étapes n’ont pas conservé leurs commandes. Vérifiez-les avant de cuisiner.',
  content_not_verified: 'Le contenu n’a pas pu être vérifié après l’envoi. Ouvrez Cookidoo avant de cuisiner.',
  content_mismatch: 'Une partie des ingrédients ou des étapes manque dans Cookidoo. Vérifiez la recette avant de cuisiner.',
  annotations_mismatch: 'Certains réglages ou certaines mesures n’ont pas été conservés. Vérifiez les étapes avant de cuisiner.',
  device_check_failed: 'Les commandes destinées au TM7 n’ont pas pu être vérifiées.',
};
