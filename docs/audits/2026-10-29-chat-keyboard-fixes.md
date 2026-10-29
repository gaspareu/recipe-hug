# Corrections clavier et composeur — 29 octobre 2026

Branche `codex/chat-keyboard-motion`, base `f894c1a`, version 1.11.3.

## Changements

- Suggestions d'accueil hors du composeur, accessibles sans défilement horizontal et retirées à la première saisie jusqu'à une nouvelle conversation. Relances du dernier message assistant dans le fil, limitées à trois ; aucun retour aux suggestions génériques après une réponse.
- Champ éditable pendant la génération : brouillon conservé, envoi toujours verrouillé jusqu'à la fin ou l'arrêt. Le bouton d'action reste monté et garde sa position en passant du micro à l'envoi puis à l'arrêt ; l'envoi au pointeur ne vole pas le focus au champ.
- Entrée ajoute une ligne sur petit écran ou avec un pointeur tactile, y compris tablette/paysage. Sur ordinateur, Entrée envoie et Maj+Entrée ajoute une ligne. La composition IME ne déclenche pas d'envoi.
- Agrandissement multiligne vers le haut conservé, sans transition ajoutée au suivi du clavier par visualViewport. Suppression du ref d'autofocus inutilisé sur Home.
- Composeur et champs éditables exclus du swipe de navigation. Réduction des animations respectée sur l'accueil, les messages, l'indicateur d'activité et l'indicateur vocal ; suppression du zoom des boutons d'action.
- Aperçu reproductible versionné dans `e2e/fixtures/chat-preview/`, sans compte ni service distant.

## Validation

Sous Node 24.21.0, version demandée par `.nvmrc` de cette base :

- `npm run check` : 77 fichiers, 613 tests réussis ; typecheck zéro erreur ; lint zéro erreur, 26 avertissements Fast Refresh préexistants sur cette base.
- `npm run build` : réussi, y compris génération PWA.
- `git diff --check` : réussi.
- Revues statiques correctness et sécurité : le cas tablette/paysage identifié en revue a été corrigé et couvert par un test ; aucun problème de sécurité actionnable.
- Vérification navigateur des composants réels dans l'aperçu : Entrée mobile multiligne, suggestions masquées après focus/effacement, saisie et focus conservés pendant l'attente, brouillon conservé à la réponse, relances contextuelles, Entrée et Maj+Entrée sur bureau, nouvelle conversation.
- À largeur 393 px, le haut du composeur d'une ligne reste à 731,5 px avant et après retrait des suggestions. Le passage à deux lignes le fait monter de 20 px. Avec un viewport réduit à 500 px de haut, le bas du composeur reste visible à 484 px ; aucun débordement horizontal constaté.
- Aucune erreur console capturée dans l'aperçu après correction de sa configuration.

[Capture mobile : rédaction pendant la réponse](assets/2026-10-29-chat/mobile-draft.png)

## Limites

Le navigateur utilise des conversations simulées, sans appel IA ni écriture Supabase. Le redimensionnement du viewport vérifie la géométrie, pas l'animation d'un clavier système. Les ouvertures/fermetures natives du clavier iOS et Android et le mode PWA installé n'ont pas été testés. La voix et le mode cuisine sont neutralisés dans l'aperçu ; leurs composants partagés sont couverts par la suite Vitest.

Les tests E2E authentifiés n'ont pas été exécutés ; les scénarios Home ont été adaptés au nouveau contrat mobile (envoi par bouton et suggestions masquées après effacement).

Les modifications sans rapport du checkout principal sont préservées ; cette branche est basée sur origin/main actualisé.

Livraison par PR ; aucun merge ni déploiement de production.

## Correctif après revue

Le test de régression reproduit des relances hors écran après un dernier contenu déjà rendu puis un [DONE] séparé. L’ancrage réagit désormais aussi à leur apparition et garde la protection du lecteur remonté dans le fil. Deux tests couvrent ces deux positions. La branche a été rebasée sur main, avec conservation de Node 24 et Tailwind 4 ; l’aperçu a été adapté à Tailwind 4. `npm run check` inclut aussi la détection de code mort et ne signale aucun résultat.
