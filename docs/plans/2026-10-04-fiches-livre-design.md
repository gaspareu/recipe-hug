# Fiches du Livre — proposition validée et implémentation

Base : origin/main avec Livre modulaire fusionné (#176). Travail isolé ; aucune écriture backend.

## Critères d’acceptation
- Identité avant illustration : préparation et rôles renseignés, plat complet, à classer, plat composé ou menu.
- Portions ajustables, quantités recalculées avec la logique existante, même choix au lancement de la cuisine ; rendement absent signalé (hypothèse 2 portions).
- Lecture mobile empilée, ingrédients et étapes en deux colonnes desktop. Cases d’ingrédients utilisables au clavier.
- Étapes titrées et durées affichées seulement lorsqu’elles existent ; aucun total temporel inventé.
- Accords après la lecture, maximum trois propositions existantes, accès manuel et ouverture du composeur avant enregistrement.
- Compositions : ordre/service des éléments, liens vers les fiches, ingrédients globaux ou par préparation, dressage, cuisine continue existante.
- Photo facultative et commandes d’édition explicites ; favori, édition, partage, historique, export et Chef conservés.

## Livraison
1. Composants partagés de portions et identité ; ajustement des interactions.
2. Fiche simple puis accords et fiche de composition.
3. Tests de portions/transmission, accords, états de composition et clavier ; check, build, navigateur avec données locales simulées si authentification indisponible ; revue pre-pr.

Périmètre : frontend et vérification locale. Aucun changement de schéma ni déploiement backend ; livraison par branche et PR, sans merge automatique.

## Résultat et preuves
- Fiche simple : identité/rôles, titre avant photo facultative, portions recalculées, étapes structurées, deux colonnes desktop et accords contextualisés.
- Compositions : éléments/services avant ingrédients sur mobile, vues Ensemble / Par préparation, ordre conservé, dressage et session continue avec les portions choisies.
- Contrats frontend réutilisés : aucune migration ni modification de fonction Edge.
- Version 1.8.0 ; baseline 589 tests.
- `npm run check` : 75 fichiers, 589 tests sans échec ; typecheck 0 erreur ; lint 0 erreur et 26 avertissements Fast Refresh préexistants ; Knip 0 résultat.
- `npm run build` : réussi. Avertissement de taille de chunks existant.
- `scripts/ui/verify-fiches.mjs` : Chromium à 375, 768 et 1440 px, préparation/plat/menu, portions, clavier, choix d’accord et préremplissage du composeur ; aucun débordement horizontal ni erreur JS.
- Vérification navigateur avec données simulées et backend fictif intercepté ; origines backend réelles bloquées, service workers désactivés. Ce contrôle ne prouve pas les flux réseau Supabase réels ni Safari/PWA iOS.
- Captures dans `/private/tmp/recipe-hug-fiches-preview`.
- Revues correctness et sécurité en lecture seule : aucun problème fonctionnel ; garde-fou réseau du script ajouté après revue sécurité.
