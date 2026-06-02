# recipe-hug

Application **PWA** de gestion de recettes avec assistant IA conversationnel (chat streaming, vision, génération d'images), planification de repas et préférences culinaires personnalisées.

## Stack

- **Frontend** : React 18 + TypeScript + Vite (SWC), Tailwind CSS + shadcn/ui (Radix)
- **Backend** : Supabase (auth, PostgreSQL, storage, edge functions Deno)
- **Data fetching** : TanStack Query v5 · **Routing** : React Router v7 · **PWA** : vite-plugin-pwa
- **IA** : multi-fournisseurs — Anthropic (défaut, clé serveur), Gemini, OpenAI

## Démarrage

Pré-requis : Node.js & npm (ou [bun](https://bun.sh)).

```sh
# 1. Cloner le dépôt
git clone <YOUR_GIT_URL>
cd recipe-hug

# 2. Installer les dépendances
npm install

# 3. Lancer le serveur de dev (http://localhost:8080)
npm run dev
```

## Scripts

```sh
npm run dev          # Serveur de dev (Vite)
npm run build        # Build de production (+ vérification TypeScript)
npm run build:dev    # Build en mode development
npm run lint         # ESLint
npm run preview      # Prévisualise le build
npm test             # Vitest (watch)
npm run test:run     # Vitest (single run) — validation / CI
```

## Variables d'environnement

Front (préfixe `VITE_`, dans `.env`) :

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

Les secrets des edge functions (clé IA par défaut `ANTHROPIC_API_KEY`, clé de chiffrement
`AI_KEYS_ENCRYPTION_SECRET`, clés ElevenLabs, `APP_URL`) sont gérés côté Supabase, hors du dépôt.

## Authentification

OAuth Google via Supabase Auth natif (`supabase.auth.signInWithOAuth`), en plus de
l'authentification email/mot de passe. Le provider Google doit être configuré dans le
dashboard Supabase (**Authentication → Providers**) avec l'URL de redirection de l'app.

## Déploiement

Déployé sur **Vercel** (branche `main` → auto-deploy). `vercel.json` gère le routing SPA.

## Documentation

- `CLAUDE.md` — guide pour les assistants IA travaillant sur le dépôt
- `EDGE_FUNCTIONS.md` — référentiel des edge functions et du pattern IA partagé
- `docs/CODEMAPS/` — cartes du code (architecture, frontend, backend, data, dependencies)
