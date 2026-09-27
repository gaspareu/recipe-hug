# Vérification des corrections de l'audit iOS — 22 septembre 2026

## Périmètre

- Base de travail : `76f7442` (`origin/main` actualisé), branche `codex/ios-pwa-audit-fixes`, worktree isolé. Les modifications du checkout `main` sont restées intactes.
- Référence : audit local des 19–20 septembre sur `78eaedf`. Les contrôles automatisés ci-dessous utilisent Chromium à 393 × 852 points ; l'observation de la PWA utilise le simulateur `recipe-hug-iPhone-15` sous iOS 26.5.
- Origine locale : `http://localhost:8081`. Le compte test utilise le projet Supabase de développement. Aucun envoi à l'assistant ni écriture de recette ou de repas n'a été nécessaire.

## Corrections vérifiées

| Constat initial | Correction | Preuve |
| --- | --- | --- |
| Neuf commandes sans nom accessible dans Livre, Planning et Profil | Noms explicites sur les sélecteurs et boutons ; champ de recherche étiqueté | Axe `button-name` et assertions par rôle/nom sans violation sur les routes testées |
| Filtres effacés par une pastille non interactive, titre de recette planifiée cliquable dans un `span` | Bouton actionnable au clavier et vrai lien de recette | Test Vitest de remise à zéro par Entrée ; test Vitest de navigation vers une recette planifiée |
| Libellés pâles des créneaux vides du Planning | Texte sans transparence sur les jetons du thème ; premier plan primaire sombre ajusté pour les boutons du thème sombre | Axe `color-contrast` sans violation sur les écrans testés en clair et sur Livre, Planning et Profil en sombre |
| Commandes de 24 à 36 points | Zones actives d'au moins 44 points pour les commandes prioritaires, la suppression, les lignes « Ajouter » et les filtres | Mesures Playwright des commandes ciblées à 393 points ; largeur du document égale au viewport à 393 et 375 points |
| Titres et régions incohérents | `main` et `h1` sur Auth/Chef/Planning ; sections `h2` sur Profil ; CTA d'installation exposé comme région nommée | Axe `landmark-one-main` et `page-has-heading-one`, assertions de titres, tests de `InstallBanner` mis à jour |

## Exécution

- `npm run check` sous Node 24.21.0 : **567 tests Vitest réussis**, typecheck sans erreur, lint sans erreur (26 avertissements Fast Refresh préexistants), Knip sans résultat. Les tests de régression vérifient aussi que les filtres annoncent leur valeur sélectionnée et que les sections repliables conservent leur description accessible.
- `npm run build` : **réussi**, manifeste et service worker PWA générés. Le build signale encore des chunks supérieurs à 500 kB, hors du périmètre de cet audit.
- `E2E_BASE_URL=http://localhost:8081 npx playwright test e2e/smoke.spec.ts e2e/home-chat.spec.ts e2e/ios-accessibility.spec.ts --project=chromium` : **14 réussis**. Après l'ajout de l'assertion sur le dimanche, le nouveau fichier `ios-accessibility.spec.ts` a été rejoué seul : **7 réussis**.
- Inspection visuelle Chromium : Planning lisible jusqu'au dimanche, sans débordement horizontal à 393 points ; Livre sans débordement à 375 points, y compris avec le bouton « Effacer tous les filtres » affiché.

Capture de contrôle **Chromium** sans donnée de profil : [Planning, semaine complète](assets/2026-09-22/chromium-mobile/recipe-hug-ios-planning-light-after.png). Elle ne remplace pas une capture de la PWA iOS.

## PWA native et limites

L'icône Grimoire associée à `localhost:8081` a été rouverte dans le même simulateur. Chef s'affiche en mode autonome, sans barre Safari ni CTA d'installation, avec la session du compte test conservée. L'autre icône Grimoire est associée à l'ancienne origine `8080` et affiche une erreur de connexion lorsque ce serveur est arrêté ; elle n'a pas été supprimée.

L'outil de contrôle du simulateur ne transmet pas les clics à la vue web de la PWA et ne remonte pas ses éléments dans l'arbre d'accessibilité macOS. **Navigation native Chef/Livre/Planning/Profil, clavier iOS, bas des pages longues dans la PWA et VoiceOver restent non exécutés.** Les passages Chromium et la capture visuelle de Chef ne prouvent pas ces scénarios. Le réglage conditionnel du placement avec clavier n'a donc pas été modifié. Rejouer ces cas sur l'iPhone simulé dès qu'un contrôle tactile ou VoiceOver fonctionnel est disponible.
