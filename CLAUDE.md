# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (Vite)
npm run build        # Production build
npm run lint         # ESLint
npm test             # Vitest (watch mode)
npm run test:run     # Vitest (single run)

# Deno tests for edge functions
deno test supabase/functions/_shared/decrypt-keys_test.ts
```

## Architecture

**Stack** : React 18 + TypeScript + Vite, Tailwind CSS + shadcn/ui, Supabase (auth, DB, storage, edge functions), TanStack Query, React Router v7.

### Frontend

- `src/pages/` — routes principales (lazy-loaded) : Home, Dashboard, RecipeDetail, RecipeEdit, Profile, MealPlanning, Auth
- `src/components/` — organisés par domaine : `recipes/`, `meal-planning/`, `chat/`, `voice/`, `auth/`, `ui/` (shadcn)
- `src/hooks/` — logique métier centralisée. Hooks clés :
  - `useAuth` — AuthProvider wrappant toute l'app, protège les routes via `ProtectedRoute`
  - `useHomeChat` / `useChatEngine` — gestion du chat IA streaming
  - `useRecipes` — CRUD recettes via TanStack Query
  - `useAISettings` — config IA par utilisateur (provider, modèles, clés chiffrées)
- `src/integrations/supabase/` — client Supabase et types générés

### Backend (Supabase Edge Functions)

Voir `EDGE_FUNCTIONS.md` pour la documentation complète. Architecture clé :

- **`_shared/`** — modules partagés entre toutes les fonctions :
  - `ai-config.ts` → `resolveAIConfig` : résolution hiérarchique (Agent Config → Settings utilisateur → Default Lovable)
  - `ai-providers.ts` → appels IA unifiés (streaming, non-streaming, vision, tool calling)
  - `decrypt-keys.ts` → chiffrement AES-GCM des clés API
- **Agent unifié** : `home-assistant` gère tout le chat d'accueil (recettes, préférences, planning, navigation, vision)
- **Providers IA supportés** : Lovable (défaut), Gemini, OpenAI, Anthropic

### Flux de données IA

Toutes les fonctions IA utilisent le pattern : `resolveAIConfig(agentType, userId)` → sélectionne provider + modèle → `callAIStreaming` ou `callAINonStreaming`.

Les clés API utilisateur sont chiffrées (AES-GCM) en base et ne sont jamais retournées en clair.
