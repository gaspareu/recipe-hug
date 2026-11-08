# Boucle de correction Cookidoo

- Diagnostiquer les erreurs d'ingrédients : référence de préparation, ingrédient absent, mesure invalide ou somme modifiée. Aucun changement des règles de conservation.
- Au plus une génération et trois patchs ciblés, même délai global de 60 secondes. Chaque patch part du dernier candidat ; revalidation entière, arrêt sur cycle, absence de progrès, patch interdit ou fournisseur en erreur.
- Échec technique : statut failed, détail concret et relance sans précision imposée. needs_input reste réservé aux blocages culinaires du candidat validé ; aucun envoi automatique.
- Régressions synthétiques inspirées du risotto : plusieurs défauts successifs, référence de préparation, quantités partagées, conservation des corrections, indices après insertion, arrêt et confidentialité.
- Tests Edge, check, build, navigateur desktop/mobile et intégration dev simulée. Revue pre-pr. Pas d'appel IA ou Cookidoo réel ni de déploiement direct.
