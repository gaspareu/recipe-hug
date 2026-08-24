# Tests E2E (Playwright)

Tests end-to-end du parcours authentifié, exécutables localement et en CI après merge
sur `main`. Ils nécessitent un compte de test et écrivent des données réelles avant leur
nettoyage.

## Prérequis

1. `.env.development.local` (gitignored) avec les variables `VITE_SUPABASE_*`
   du projet Supabase de développement. Playwright utilise la même priorité que
   Vite et refuse de démarrer si ces variables pointent vers un autre projet.
2. Copier `.env.test.example` en `.env.test` (gitignored), puis renseigner le
   compte de test :
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

Le job `e2e` de `.github/workflows/ci.yml` lance ces tests **au push sur `main`
(post-merge) uniquement**. Les identifiants du compte test sont des **secrets de dépôt**
(`TEST_EMAIL` / `TEST_PASSWORD`) ; les valeurs `VITE_*` (publiques) sont dans le workflow.

- **Pourquoi pas sur les PR** : le job exécute des scripts contrôlés par la PR
  (`npm ci`, `npm run …`). Les faire tourner avec les secrets exposerait le compte test
  au code d'une PR arbitraire (« pwn request »). On garde donc l'E2E post-merge.
  Un échec est alors visible sur `main` juste après le merge.
- Ces tests **écrivent des données réelles** (nettoyées en fin de test) sur le compte
  configuré. Idéalement, utiliser un **compte jetable** dédié à la CI.
