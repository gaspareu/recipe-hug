# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **recipe-hug** — Application PWA de gestion de recettes avec assistant IA conversationnel (chat streaming, vision, génération d'images), planification de repas et préférences culinaires personnalisées. Déployé sur Vercel.

## Environnement de développement 

**tout l'outillage agent doit être committé dans le repo** pour être disponible automatiquement. Privilégier des artefacts versionnés :

- **`.mcp.json`** (racine, committé) — déclare le serveur MCP **Supabase** (HTTP). L'intégration **GitHub** est fournie nativement par Claude Code Web (pas de `gh` CLI dans le conteneur).
- **`.claude/settings.json`** (committé) — hook `SessionStart` exécutant `npm ci` (conteneur prêt dès l'ouverture de session), hooks `PreToolUse`/`PostToolUse` (`.claude/hooks/git-guard.mjs` : blocage commit/push sur `main`, force push, édition des fichiers auto-générés ; rappel de redéploiement des edge functions) + permissions pré-accordées pour npm/git/deno (moins de prompts).
- **`.claude/skills/git-github/`** (committé) — skill projet : bonnes pratiques git/GitHub (branches, commits conventionnels en français, validation avant push, PR, redéploiement edge functions). À consulter avant tout commit/push/PR.
- **`.claude/skills/check/`** (committé) — skill `/check` : garde-fou qualité rapide et déterministe (tests + typecheck + lint, comparés au baseline de non-régression). À lancer à volonté pendant le dev et avant tout commit.
- **`.claude/skills/pre-pr/`** (committé) — skill `/pre-pr` : revue approfondie avant PR (enchaîne `/check`, `/simplify`, l'agent `code-reviewer` et `/security-review`). À lancer une fois quand une feature est prête.
- **CI GitHub Actions** (`.github/workflows/ci.yml`) — tests + build + `deno test` ; c'est le **garde-fou de non-régression**, car la session web ne revalide pas tout automatiquement. `typecheck` et `lint` y tournent en mode informatif (non-bloquant) tant que la dette de types/lint préexistante n'est pas résorbée.
- **`.github/dependabot.yml`** (committé) — PR hebdomadaires de mise à jour des dépendances npm et des GitHub Actions.

Toute nouvelle dépendance d'outillage (MCP, hook, skill, permission) doit être ajoutée **au repo sous `.claude/` ou à la racine**, jamais configurée hors-repo.

## Commands

```bash
npm run dev          # Dev server (Vite, http://localhost:8080)
npm run build        # Build de production (Vite/SWC — ne vérifie PAS les types)
npm run build:dev    # Build en mode development
npm run lint         # ESLint (flat config, eslint.config.js)
npm run typecheck    # Vérification de types TypeScript (tsc -b --noEmit)
npm run preview      # Prévisualise le build
npm test             # Vitest (watch mode)
npm run test:run     # Vitest (single run) — à utiliser en validation/CI

# Tests Deno des edge functions (chiffrement des clés)
deno test supabase/functions/_shared/decrypt-keys_test.ts
```

⚠️ **`npm run build` ne vérifie pas les types.** `vite build` (SWC) transpile sans passer par `tsc` : un build vert ne prouve rien sur la validité des types. La vérification est `npm run typecheck` (`tsc -b --noEmit`), et c'est elle qu'il faut lancer avant de conclure qu'un changement compile.

Ce script porte une dette préexistante : comparer le nombre d'erreurs avant/après plutôt que d'exiger zéro. Baseline de non-régression au **2026-07-23** : `typecheck` = **0 erreur**, `lint` = **0 problème**, `test:run` = **0 échec**. Le skill **`/check`** automatise cette comparaison ; tenir ces chiffres à jour dans les deux fichiers (`CLAUDE.md` + `.claude/skills/check/SKILL.md`) quand la dette évolue.

## Architecture

**Stack** : React 18 + TypeScript + Vite (SWC), Tailwind CSS + shadcn/ui (Radix), Supabase (auth, DB Postgres, storage, edge functions Deno), TanStack Query v5, React Router v7, vite-plugin-pwa. Auth OAuth via Supabase natif (`supabase.auth.signInWithOAuth`).

### Frontend (`src/`)

- **`pages/`** — routes (lazy-loaded dans `App.tsx`) : `Home`, `Dashboard`, `RecipeDetail`, `RecipeEdit`, `RecipeNew`, `Profile`, `MealPlanning`, `Auth`, `NotFound`. La racine `/` redirige vers `/home` ; toutes les routes (hors `/auth`) sont protégées par `ProtectedRoute`.
- **`components/`** — organisés par domaine :
  - `recipes/` — cartes, éditeurs (ingrédients/étapes), partage, historique de versions, checklist, assistant cuisson
  - `meal-planning/` — `GroceryListSheet` (liste de courses générée depuis un planning)
  - `chat/` — `ChatInterface` (chat IA d'accueil)
  - `voice/` — contrôles vocaux + indicateur (ElevenLabs)
  - `profile/` — réglages IA, préférences culinaires, thème, intégration webhook
  - `auth/` — `ProtectedRoute` ; `layout/` — `Header`, `MainLayout`
  - `ui/` — composants shadcn/ui (réutiliser ceux-ci, ne pas réinventer)
- **`hooks/`** — logique métier centralisée (toute la logique non triviale vit ici, pas dans les composants). Hooks clés :
  - `useAuth` — `AuthProvider` enveloppe l'app, expose session/user et protège les routes
  - `useHomeChat` / `useChatEngine` — chat IA d'accueil streaming
  - `useRecipeChat` — assistant de cuisson lié à une recette
  - `useRecipes` — CRUD recettes via TanStack Query (`useRecipes`, `useRecipe`, `useCreateRecipe`, `useUpdateRecipe`, `useDeleteRecipe`, `useToggleFavorite`)
  - `useRecipeVersions` — historique de versions ; `useGenerateRecipeImage` — génération d'image
  - `useAISettings` — config IA par utilisateur (provider, modèles, clés chiffrées)
  - `useUserPreferences` — préférences culinaires ; `useWebhookToken` — token webhook personnel
  - `useVoiceMode` — mode vocal (ElevenLabs TTS + Scribe)
  - `useInstallPrompt` / `useNetworkStatus` / `useTheme` / `use-mobile` — PWA, offline, thème, responsive
- **`integrations/supabase/`** — `client.ts` (instance `supabase`) et `types.ts` (types DB générés). **Auto-générés, ne pas éditer.** Import : `import { supabase } from "@/integrations/supabase/client"`. L'authentification (email/mot de passe + OAuth Google) passe directement par `supabase.auth`.
- **`types/recipe.ts`** — types métier source de vérité : `Recipe`, `Ingredient`, `Step`, `RecipeStatus` (`draft | tested | validated | archived`), `RecipeFormData`. `Step.tm7` porte les paramètres machine Thermomix (mode, durée, température, vitesse, sens inverse, accessoire — cf. `src/lib/thermomix/reference.ts`) ; il est absent des étapes manuelles.
- **`lib/utils.ts`** — `cn()` (clsx + tailwind-merge), utilisé partout pour les classes conditionnelles.
- Alias d'import : `@/` → `src/`.

### Backend — Supabase Edge Functions (`supabase/functions/`, Deno)

Voir **`EDGE_FUNCTIONS.md`** pour la doc complète. Architecture clé :

- **`_shared/`** — modules partagés entre toutes les fonctions :
  - `ai-config.ts` → `resolveAIConfig` : résolution hiérarchique **Agent Config → Settings utilisateur → Default configurable**, options : `agentType`, `defaultModel`, `defaultProvider` (si omis : Anthropic), `requiredCapabilities`
  - `ai-providers.ts` → appels IA unifiés : `callAIStreaming`, `callAINonStreaming`, helpers tool-calling/vision
  - `ai-types.ts` → types et constantes (`AIProvider`, `DEFAULT_MODELS`, `PROVIDER_ENDPOINTS`, `CAPABILITY_MODELS`) — modèles image : `gemini-2.5-flash-image`, `dall-e-3`
  - `decrypt-keys.ts` → chiffrement AES-GCM des clés API (`encryptValue`, `decryptValue`, `maskApiKey`)
  - `cors.ts` → `corsHeaders` centralisés
- **Agent unifié** : `home-assistant` gère tout le chat d'accueil (création de recette, préférences, planning, navigation, vision) via tool calling (`save_recipe`, `update_preferences`, `navigate`, `save_meal_plan`). L'ancien système multi-agents a été supprimé.
- **Fonctions de traitement** (non-streaming) : `generate-recipe`, `analyze-recipe`, `extract-user-preferences`, `parse-recipe-image` (vision + protection SSRF), `generate-recipe-image`.
- **Webhook externe** : `webhook-recipe` — authentifié par token (`profiles.webhook_token`), **pas** par JWT.
- **Utilitaires (sans IA)** : `manage-ai-keys`, `validate-ai-key`, `elevenlabs-tts`, `elevenlabs-scribe-token`, `share-recipe`, `claim-shares`.
- **Connecteur Cookidoo (export Thermomix TM7)** : `manage-cookidoo-credentials` (identifiants chiffrés AES-GCM) + `export-recipe-cookidoo` (envoi d'une recette vers Cookidoo, **scope TM7 uniquement**). L'export est **asynchrone** : la fonction répond `{ ok, export_id, status: "pending" }` puis poursuit en tâche de fond, et le front interroge le journal `cookidoo_exports` jusqu'au statut final (hook `useCookidooExport`). Source unique partagée dans `supabase/functions/_shared/cookidoo/` — réutilisée par le CLI `connector/cookidoo/cli.ts` (fallback IP résidentielle). Le **référentiel machine TM7** (`_shared/thermomix/reference.ts`, miroir front `src/lib/thermomix/reference.ts`) est la base de référence commune : il alimente le prompt IA, le mapper (annotations guided cooking `TTS` + `INGREDIENT`) et la validation du payload. Voir `supabase/functions/CLAUDE.md`.
- **Providers IA** : Anthropic (défaut, clé serveur `ANTHROPIC_API_KEY`), Gemini (clé serveur `GEMINI_API_KEY` pour la génération d'images, BYOK pour le chat), OpenAI (BYOK). Anthropic ne génère pas d'images — `generate-recipe-image` utilise `gemini-2.5-flash-image` via l'API native Gemini (`/v1beta/models/{model}:generateContent`, **pas** l'endpoint OpenAI-compat).
- `verify_jwt = false` est configuré dans `supabase/config.toml` pour les fonctions IA (l'auth est gérée dans le corps de la fonction).
- **Déploiement MCP** : les imports `../_shared/` ne fonctionnent pas avec le bundler MCP — inliner le code partagé directement dans le fichier déployé. Voir `supabase/functions/CLAUDE.md`.

### Flux de données IA

Toute fonction IA suit : `resolveAIConfig(agentType, userId)` → sélectionne provider + modèle → `callAIStreaming` (chat) ou `callAINonStreaming` (traitement). Les clés API utilisateur sont **chiffrées (AES-GCM) en base et jamais retournées en clair** (masquées à la lecture).

### Base de données (Supabase Postgres)

Migrations horodatées dans `supabase/migrations/` (appliquées dans l'ordre). Tables principales : `recipes`, `recipe_versions`, `recipe_shares`, `meal_plans`, `profiles`, `user_ai_settings`, `user_culinary_preferences`, `ai_conversations`, `cookidoo_exports` (journal des exports Thermomix — lecture propriétaire uniquement, écriture réservée au service role). Vues « safe » : `profiles_safe`, `user_ai_settings_safe`. RPC : `generate_webhook_token`, `get_my_webhook_token`, `get_user_id_by_phone`. RLS activé — l'isolation par `user_id` est assurée côté DB.

## Conventions

- **TypeScript strict** : éviter `any` ; définir/étendre les types dans `src/types/` ou réutiliser les types DB générés.
- **Data fetching** : toujours via TanStack Query encapsulé dans un hook de `src/hooks/`. Ne pas appeler `supabase` directement depuis un composant.
- **UI** : composer à partir de `src/components/ui/` (shadcn) + classes Tailwind via `cn()`. Suivre les patterns existants du domaine concerné.
- **Langue** : l'UI et les commentaires sont en **français** — rester cohérent.
- **Fichiers auto-générés à NE PAS éditer** : `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`.
- **Tests** : Vitest + Testing Library (jsdom), setup dans `src/test/setup.ts`, fichiers `*.test.ts(x)` colocalisés. Tests Deno pour le chiffrement des edge functions.

## Déploiement

- **Vercel**, branche `main` → auto-deploy. `vercel.json` gère le routing SPA (rewrites → `index.html`).
- **PWA** : configurée via `vite-plugin-pwa` (`vite.config.ts`) — `registerType: autoUpdate`, runtime caching (Google Fonts, API Supabase en NetworkFirst), manifest dans `public/`.
- **Version visible** : `version` de `package.json` + SHA du commit + date de build, injectés à la compilation (`define` dans `vite.config.ts`, SHA fourni par `VERCEL_GIT_COMMIT_SHA` en prod) et affichés **en bas de la page Profil** (`src/lib/version.ts`). C'est la référence pour vérifier quel build front est réellement servi (le cache PWA peut retarder la mise à jour). Incrémenter `version` dans `package.json` à chaque évolution notable. Pour le backend, la version des edge functions se vérifie côté Supabase (`get_edge_function`).

## Variables d'environnement

Front (préfixe `VITE_`, dans `.env` — voir `.env.example` ; `.env` est gitignoré) : `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`. Valeurs publiques (la publishable key est la clé anon). Projet Supabase : `ifpqsyyvytfpossqycpc`.

Secrets edge functions (Supabase Dashboard → Project Settings → Edge Functions) :

| Secret | Usage |
|--------|-------|
| `ANTHROPIC_API_KEY` | IA par défaut (chat, analyse, génération) |
| `GEMINI_API_KEY` | Génération d'images (défaut serveur pour `generate-recipe-image`) |
| `AI_KEYS_ENCRYPTION_SECRET` | Chiffrement AES-GCM des clés API utilisateur |
| `APP_URL` | URL de l'app (`https://recipe-hug.vercel.app`) |
| `ELEVENLABS_API_KEY` | TTS + Scribe |

## Documentation complémentaire

- `EDGE_FUNCTIONS.md` — référentiel détaillé des edge functions et du pattern IA partagé.
- `supabase/functions/CLAUDE.md` — guide opérationnel : déploiement MCP, secrets, inventaire des fonctions.
- `docs/CODEMAPS/` — cartes du code : `architecture.md`, `frontend.md`, `backend.md`, `data.md`, `dependencies.md`.
