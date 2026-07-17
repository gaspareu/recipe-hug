# Tests E2E (Playwright)

Tests end-to-end **locaux** du parcours authentifié. Pas encore câblés en CI :
ils nécessitent un compte de test et écrivent potentiellement des données réelles.

## Prérequis

1. `.env` (gitignored) avec les variables `VITE_SUPABASE_*` (l'app doit monter).
2. `.env.test` (gitignored) avec le compte de test :
   ```
   TEST_EMAIL=...
   TEST_PASSWORD=...
   ```
3. Le navigateur Playwright : `npx playwright install chromium`.

## Lancer

```bash
npm run test:e2e            # tout
npm run test:e2e -- --ui    # mode UI
```

Playwright démarre `npm run dev` automatiquement (ou réutilise un serveur déjà
lancé sur `http://localhost:8080` ; surcharger via `E2E_BASE_URL`).

## Contenu

- `auth.setup.ts` — connexion unique → session sauvée dans `e2e/.auth/user.json`
  (gitignored : contient un jeton de session).
- `smoke.spec.ts` — protection des routes + rendu des pages clés (déterministe,
  sans IA ni écriture).
- `recipe-creation.spec.ts` — **flux de création** de recette : l'échange avec
  `home-assistant` est **simulé une fois** (réponse SSE figée avec un tool call
  `save_recipe`, zéro token, déterministe) ; on teste le clic « Créer » avec
  **écriture réelle** en base, vérification de la persistance, puis nettoyage.
  Les endpoints de fond (`generate-recipe-image`, `analyze-recipe`) sont stubés.
- `grocery-list.spec.ts` — **flux liste de courses** (sans IA) : une recette avec
  un ingrédient connu est ajoutée au planning via l'UI (écriture réelle), puis on
  vérifie l'agrégation dans la liste. Nettoyage ensuite.
- `helpers/supabase.ts` — client authentifié comme le compte test (RLS) pour
  vérifier/nettoyer les données créées.

> Principe : on ne teste **pas** que le chat/LLM fonctionne (non déterministe,
> coûteux), mais le **flux applicatif** déclenché ensuite. L'échange IA est simulé.

## Exécution en CI

Le job `e2e` de `.github/workflows/ci.yml` lance ces tests **au push sur `main`**
(post-merge). Les identifiants du compte test sont des **secrets de l'environnement
GitHub `production`** (`TEST_EMAIL` / `TEST_PASSWORD`) — le job s'y rattache via
`environment: production`. Les valeurs `VITE_*` (publiques) sont dans le workflow.

- **Pourquoi au push sur `main` et pas sur les PR** : les secrets sont portés par
  l'environnement `production` ; une PR depuis une branche n'y a pas forcément accès
  (et éviterait une éventuelle approbation manuelle). Pour faire tourner l'E2E sur
  les PR, ajouter les identifiants en secrets **de dépôt** (ou un environnement non
  restreint) et retirer le garde `if:` du job.
- Ces tests **écrivent des données réelles** (nettoyées en fin de test) sur le compte
  configuré. Idéalement, utiliser un **compte jetable** dédié à la CI.
