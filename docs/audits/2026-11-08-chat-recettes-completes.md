# Recettes complètes dès le chat — 8 novembre 2026

Le chat propose et transmet désormais les métadonnées du Livre avec la recette :
type de fiche (`preparation` / `complete_dish`), description, saison, tags et score
calorique, rôles culinaires, saveurs, textures, équipement, allergènes, régimes,
temps actif et préparation à l’avance. Les titres et ingrédients de chaque étape
font aussi partie du contrat obligatoire de génération.

Les parcours couverts sont l’accueil, le chat d’une fiche, le mode cuisine,
la complétion après création et le bouton d’analyse. Les anciennes propositions
sans métadonnées restent lisibles ; la complétion sert de repli. Une proposition
déjà complète évite le deuxième appel IA d’analyse.

La complétion ne remplace pas un classement ou un profil déjà renseigné. Une
modification explicite depuis Chef régénère le profil fourni pour garder les
métadonnées cohérentes avec les nouveaux ingrédients. Les états de revue des
allergènes et régimes sont toujours `unknown` après génération : seul l’utilisateur
peut valider ces vérifications.

## Validation locale

- `npm run check` : 643 tests Vitest, typecheck, ESLint et Knip.
- `npm run test:edge` : 290 tests Deno.
- `deno check` : `home-assistant` et `analyze-recipe`, lockfile figé.
- `npm run build` : build et PWA produits.
- Navigateur Chrome, serveur local : session et services Supabase/IA simulés,
  message → proposition → clic « Créer la recette » → carte enregistrée. Inspection
  des écritures : classement, description et profil transmis, revues `unknown`,
  aucun deuxième appel d’analyse, aucune erreur JavaScript.
- Revue correctness et sécurité selon `pre-pr` : cas du profil obsolète après
  modification corrigé ; aucun constat de sécurité bloquant.
- Revue avant PR : invalidation des revues avant tout changement culinaire (échec
  bloquant), rejet des analyses sans classement/profil valide, et protection des
  analyses/complétions tardives par comparaison de `updated_at`. Quatre tests
  frontend et un test Edge supplémentaires couvrent ces régressions.

Aucun appel IA réel, aucune écriture distante, aucun déploiement effectué. Le
rendu et la qualité des classifications d’un modèle réel restent à vérifier en
environnement de développement. Les fonctions `home-assistant` et `analyze-recipe`
devront être déployées via le workflow CI pour activer le nouveau contrat.
