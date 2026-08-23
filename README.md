# recipe-hug

PWA de gestion de recettes pensée comme un compagnon de cuisine personnel : bibliothèque
de recettes, assistant IA conversationnel, import par image, planification des repas,
liste de courses, mode vocal et export Cookidoo pour Thermomix TM7.

L'application est déployée sur [recipe-hug.vercel.app](https://recipe-hug.vercel.app).

## Fonctionnalités

- création, édition, favoris, statuts, partage et historique des versions d'une recette ;
- assistant IA unifié en streaming pour créer ou modifier une recette, naviguer dans
  l'application, enregistrer des préférences et préparer un planning ;
- analyse de photos de recettes et génération d'illustrations ;
- planification des repas et génération d'une liste de courses ;
- assistant de cuisson, checklist d'ingrédients et commandes vocales ElevenLabs ;
- export asynchrone vers Cookidoo, limité au référentiel Thermomix TM7 ;
- installation PWA, mise à jour automatique et comportement hors ligne.

## Architecture

```text
PWA React / Vite
├── pages et composants shadcn/ui
├── hooks métier + TanStack Query
└── client Supabase
    ├── Auth, PostgreSQL, RLS et Storage
    └── Edge Functions Deno
        ├── assistant IA et traitements vision/image
        ├── Anthropic, Gemini et OpenAI
        ├── voix ElevenLabs
        └── connecteur Cookidoo TM7
```

Le frontend ne porte pas la logique métier non triviale : elle vit dans `src/hooks/`.
Les appels IA passent par `resolveAIConfig`, puis par la couche fournisseur partagée des
edge functions. Les clés utilisateur sont chiffrées en AES-GCM et ne sont jamais
retournées en clair. L'isolation des données est assurée par les politiques RLS.

## Stack

- **Frontend** : React 18, TypeScript strict, Vite/SWC, Tailwind CSS, shadcn/ui ;
- **Données** : Supabase Auth, PostgreSQL, Storage, TanStack Query v5 ;
- **Backend** : Supabase Edge Functions sous Deno ;
- **IA** : Anthropic par défaut, Gemini et OpenAI en BYOK, Gemini pour les images ;
- **PWA** : React Router v7 et `vite-plugin-pwa` ;
- **Déploiement** : Vercel pour le frontend, GitHub Actions pour la CI et les edge functions.

## Démarrage local

Pré-requis : Node.js 22.12 ou supérieur (branche 22.x), npm et Git. Deno 2 est nécessaire pour tester les edge
functions ; Playwright est nécessaire uniquement pour les tests E2E.

```sh
git clone https://github.com/gaspareu/recipe-hug.git
cd recipe-hug

nvm use
npm ci
cp .env.example .env
npm run dev
```

Le serveur Vite écoute sur <http://localhost:8080>. Renseigner dans `.env` les valeurs
publiques d'une branche ou d'un projet Supabase de développement. Le template ne pointe
volontairement pas vers la production, car les écritures faites dans l'app sont réelles.
Les secrets IA, Cookidoo et ElevenLabs restent dans Supabase.

## Commandes

```sh
npm run dev           # serveur Vite
npm run test:run      # tests unitaires Vitest
npm run typecheck     # TypeScript ; le build Vite ne vérifie pas les types
npm run lint          # ESLint
npm run check         # tests + typecheck + lint
npm run build         # bundle de production et PWA
npm run test:edge     # tests Deno des modules partagés
npm run check:all     # garde-fous complets avant livraison
npm run test:e2e      # parcours authentifiés Playwright
npm run preview       # prévisualisation locale du build
```

Les E2E exigent un compte jetable dans `.env.test`. Ils écrivent temporairement des
données puis les nettoient ; voir [`e2e/README.md`](e2e/README.md).

## Variables d'environnement

Variables publiques du frontend, dans `.env` :

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

Principaux secrets des edge functions, configurés dans Supabase sous
**Edge Functions → Secrets** (et non dans Database Vault) :

- `ANTHROPIC_API_KEY` et `GEMINI_API_KEY` ;
- `AI_KEYS_ENCRYPTION_SECRET` ;
- `ELEVENLABS_API_KEY` ;
- `APP_URL`.

## Développement avec Codex

Le setup Codex est versionné avec le projet :

- `AGENTS.md` décrit l'architecture, les conventions et les fichiers protégés ;
- `.codex/config.toml` connecte Vercel, le projet Supabase de développement et un accès
  Supabase de production limité en lecture seule ;
- `.codex/hooks.json` maintient les dépendances à jour sans exécuter leurs scripts
  lifecycle, et bloque les opérations Git dangereuses ou l'édition des fichiers Supabase générés ;
- `.agents/skills/` contient les workflows `feature-workflow`, `debug`, `check`,
  `dependency-updates`, `pre-pr`, `git-github` et `ui-ux-pro-max`.

Au premier lancement dans Codex, marquer le projet comme fiable, approuver les hooks,
puis terminer l'authentification OAuth de GitHub, Vercel et Supabase. Utiliser un task
et un worktree par feature, puis y recréer les variables locales depuis `.env.example`.
Le MCP de production reste volontairement en lecture seule ; les migrations sont
développées et vérifiées sur le projet isolé `recipe-hug-dev`.

Le workflow complet — feature, debug, PR, base de données, dépendances, plugins et
automatisations recommandées — est détaillé dans
[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

## CI, livraison et dépendances

- toute évolution passe par une branche et une pull request vers `main` ;
- la CI bloque sur la dependency review, Vitest, build, typecheck, lint et tests Deno ;
- les E2E authentifiés tournent après merge sur `main`, sans exposer leurs secrets aux PR ;
- Vercel crée les previews et déploie automatiquement `main` ;
- les edge functions modifiées sont déployées par GitHub Actions après merge ;
- Dependabot ouvre chaque semaine des PR npm et GitHub Actions, avec majors séparées
  et mises à jour mineures/patch regroupées.

Le projet conserve **Dependabot plutôt que Renovate** : pour ce dépôt npm unique, il
couvre déjà les dépendances et les Actions avec moins d'outillage. Les deux bots ne
doivent pas être activés ensemble. Renovate ne deviendrait pertinent qu'avec plusieurs
écosystèmes, un monorepo ou le besoin d'un Dependency Dashboard avancé.

## Documentation

- [`AGENTS.md`](AGENTS.md) — référence chargée automatiquement par Codex ;
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — workflow de développement complet ;
- [`EDGE_FUNCTIONS.md`](EDGE_FUNCTIONS.md) — edge functions et couche IA partagée ;
- [`docs/CODEMAPS/`](docs/CODEMAPS/) — cartes frontend, backend, données et dépendances ;
- [`docs/BACKLOG.md`](docs/BACKLOG.md) — améliorations produit à venir.
