# AGENTS.md

Consignes durables de **recipe-hug**, PWA de recettes avec assistant IA, planification de repas et préférences culinaires. Déployée sur Vercel.

## Principes du dépôt

- Tout l'outillage agent doit être versionné dans le dépôt (`.codex/`, `.agents/` ou racine), jamais configuré seulement en local.
- `.codex/config.toml` configure les MCP Supabase et Vercel. La production Supabase est en lecture seule ; les écritures passent par le projet de développement ou la CI.
- `.codex/hooks.json` active la préparation des dépendances et les garde-fous Git/fichiers générés. Ne pas les contourner.
- Les modifications sans rapport avec la demande appartiennent à l'utilisateur : les préserver.
- La CI (`.github/workflows/ci.yml`) est le garde-fou de non-régression ; Dependabot est configuré dans `.github/dependabot.yml`.

## Workflows à utiliser

- Avant un commit, push ou une PR : lire `.agents/skills/git-github/SKILL.md`.
- Pendant le développement et avant un commit : utiliser `.agents/skills/check/SKILL.md`.
- Feature, bug, mise à jour de dépendance, préparation de PR ou travail UI : utiliser respectivement `feature-workflow`, `debug`, `dependency-updates`, `pre-pr` ou `ui-ux-pro-max`.

## Commandes de référence

```bash
npm run dev          # Vite, http://localhost:8080
npm run test:run     # Vitest en une exécution
npm run typecheck    # tsc -b --noEmit
npm run lint         # ESLint
npm run check        # tests + typecheck + lint
npm run check:all    # check + build + tests Deno
npm run build        # build Vite seulement : ne vérifie pas les types
npm run test:edge    # tests Deno des modules Edge partagés
```

`npm run build` ne remplace jamais `npm run typecheck`. Baseline au 2026-08-29 : typecheck 0 erreur, lint 0 problème, `test:run` 571 tests sans échec. Mettre ce baseline à jour ici et dans le skill `check` si la suite évolue.

## Routage du contexte

- Pour une modification frontend, lire au besoin `docs/CODEMAPS/frontend.md` et le code du domaine concerné.
- Pour une migration, RLS, Auth, stockage ou Edge Function, lire d'abord `supabase/functions/AGENTS.md` et `EDGE_FUNCTIONS.md` ; ils portent les détails de sécurité, IA, secrets et déploiement.
- Pour comprendre l'architecture, les données ou les dépendances, consulter `docs/CODEMAPS/{architecture,data,dependencies}.md` plutôt que d'étendre ce fichier.
- Les routes sont dans `src/pages/`, les composants dans `src/components/`, et la logique métier non triviale dans `src/hooks/`.

## Conventions d'implémentation

- TypeScript strict : pas de `any` évitable ; types métier dans `src/types/` ou types DB générés.
- Ne jamais modifier `src/integrations/supabase/client.ts` ni `src/integrations/supabase/types.ts`.
- Les accès données passent par TanStack Query, encapsulé dans un hook ; pas d'appel Supabase direct depuis un composant.
- Composer l'UI depuis `src/components/ui/` et `cn()` ; interface et commentaires en français.
- `package-lock.json` et `deno.lock` sont versionnés. Après une modification de `package.json`, régénérer `deno.lock` avant la CI Edge gelée.
- Les tests Vitest sont colocalisés (`*.test.ts(x)`) ; les tests Edge Deno couvrent les modules partagés.

## Livraison

- `main` déclenche le déploiement Vercel ; `vercel.json` porte le routage SPA.
- Incrémenter `version` dans `package.json` pour une évolution notable. La version visible est définie dans `src/lib/version.ts`.
- Avant tout changement de configuration ou de déploiement backend, suivre les instructions spécifiques de `supabase/functions/AGENTS.md`.

## Références détaillées

- `EDGE_FUNCTIONS.md` : architecture et contrats Edge Functions.
- `supabase/functions/AGENTS.md` : opérations Edge, secrets et déploiement.
- `docs/CODEMAPS/` : architecture, frontend, backend, données et dépendances.
- `.env.example` : variables publiques frontend ; les secrets Edge restent dans Supabase.
