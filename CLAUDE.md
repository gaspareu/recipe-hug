# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **recipe-hug** — Application PWA de gestion de recettes avec assistant IA conversationnel (chat streaming, vision, génération d'images), planification de repas et préférences culinaires personnalisées. Déployé sur Vercel.

## Commands

```bash
npm run dev          # Dev server (Vite, http://localhost:8080)
npm run build        # Build de production (effectue aussi la vérif TypeScript)
npm run build:dev    # Build en mode development
npm run lint         # ESLint (flat config, eslint.config.js)
npm run preview      # Prévisualise le build
npm test             # Vitest (watch mode)
npm run test:run     # Vitest (single run) — à utiliser en validation/CI

# Tests Deno des edge functions (chiffrement des clés)
deno test supabase/functions/_shared/decrypt-keys_test.ts
```

Il n'y a pas de script `typecheck` dédié ; `npm run build` (`vite build`) effectue la vérification TypeScript.

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
- **`types/recipe.ts`** — types métier source de vérité : `Recipe`, `Ingredient`, `Step`, `RecipeStatus` (`draft | tested | validated | archived`), `RecipeFormData`.
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
- **Providers IA** : Anthropic (défaut, clé serveur `ANTHROPIC_API_KEY`), Gemini (clé serveur `GEMINI_API_KEY` pour la génération d'images, BYOK pour le chat), OpenAI (BYOK). Anthropic ne génère pas d'images — `generate-recipe-image` utilise `gemini-2.5-flash-image` via l'API native Gemini (`/v1beta/models/{model}:generateContent`, **pas** l'endpoint OpenAI-compat).
- `verify_jwt = false` est configuré dans `supabase/config.toml` pour les fonctions IA (l'auth est gérée dans le corps de la fonction).
- **Déploiement MCP** : les imports `../_shared/` ne fonctionnent pas avec le bundler MCP — inliner le code partagé directement dans le fichier déployé. Voir `supabase/functions/CLAUDE.md`.

### Flux de données IA

Toute fonction IA suit : `resolveAIConfig(agentType, userId)` → sélectionne provider + modèle → `callAIStreaming` (chat) ou `callAINonStreaming` (traitement). Les clés API utilisateur sont **chiffrées (AES-GCM) en base et jamais retournées en clair** (masquées à la lecture).

### Base de données (Supabase Postgres)

Migrations horodatées dans `supabase/migrations/` (appliquées dans l'ordre). Tables principales : `recipes`, `recipe_versions`, `recipe_shares`, `meal_plans`, `profiles`, `user_ai_settings`, `user_culinary_preferences`, `ai_conversations`. Vues « safe » : `profiles_safe`, `user_ai_settings_safe`. RPC : `generate_webhook_token`, `get_my_webhook_token`, `get_user_id_by_phone`. RLS activé — l'isolation par `user_id` est assurée côté DB.

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

## Variables d'environnement

Front (préfixe `VITE_`, dans `.env`) : `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`. Projet Supabase : `ifpqsyyvytfpossqycpc`.

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
