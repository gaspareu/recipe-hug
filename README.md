# recipe-hug

Application **PWA** de gestion de recettes avec assistant IA conversationnel (chat streaming, vision, génération d'images), planification de repas et préférences culinaires personnalisées.

## Stack

- **Frontend** : React 18 + TypeScript + Vite (SWC), Tailwind CSS + shadcn/ui (Radix)
- **Backend** : Supabase (auth, PostgreSQL, storage, edge functions Deno)
- **Data fetching** : TanStack Query v5 · **Routing** : React Router v7 · **PWA** : vite-plugin-pwa
- **IA** : multi-fournisseurs — Anthropic (défaut, clé serveur), Gemini, OpenAI

## Démarrage

Pré-requis : Node.js 22 (voir `.nvmrc`) et npm.

```sh
# 1. Cloner le dépôt
git clone <YOUR_GIT_URL>
cd recipe-hug

# 2. Installer exactement les dépendances verrouillées
npm ci

# 3. Préparer la configuration publique Supabase
cp .env.example .env

# 4. Lancer le serveur de dev (http://localhost:8080)
npm run dev
```

## Scripts

```sh
npm run dev          # Serveur de dev (Vite)
npm run build        # Build de production (sans vérification TypeScript)
npm run build:dev    # Build en mode development
npm run typecheck    # Vérification TypeScript
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

## Codex

- `AGENTS.md` contient l'architecture, les conventions et les commandes chargées automatiquement.
- `.agents/skills/` contient les workflows projet (`check`, `pre-pr`, `git-github`, UI/UX).
- `.codex/config.toml` configure les MCP Supabase et Vercel ; au premier lancement,
  marquer le projet comme fiable puis terminer leur authentification OAuth si Codex le demande.
- `.codex/hooks.json` installe les dépendances au démarrage si le lockfile a changé et
  active les garde-fous Git/fichiers. Les hooks doivent être approuvés une première fois.

## Documentation

- `AGENTS.md` — guide de travail chargé par Codex
- `EDGE_FUNCTIONS.md` — référentiel des edge functions et du pattern IA partagé
- `docs/CODEMAPS/` — cartes du code (architecture, frontend, backend, data, dependencies)
- `docs/BACKLOG.md` — liste des améliorations à réaliser.
