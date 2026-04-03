<!-- Generated: 2026-03-18 | Files scanned: 120 | Token estimate: ~650 -->

# Architecture — recipe-hug

## Stack
- **Frontend**: React 18 + TypeScript + Vite, Tailwind CSS + shadcn/ui, React Router v7, TanStack Query, PWA (service worker, install prompt, offline support)
- **Backend**: Supabase (auth, DB, storage, Edge Functions Deno)
- **AI**: Multi-provider (Lovable default, Gemini, OpenAI, Anthropic) via unified layer
- **Voice**: ElevenLabs (TTS + STT)

## System Diagram

```
Browser (PWA)
  └── React App (Vite)
        ├── Pages (lazy-loaded) → Supabase Auth (JWT)
        ├── Hooks (business logic) → TanStack Query → Supabase DB
        └── Chat/Voice → Edge Functions → AI Providers
                                              ├── Lovable (default)
                                              ├── OpenAI / Anthropic / Gemini
                                              └── ElevenLabs (voice)
```

## Data Flow — AI Chat

```
useHomeChat → useChatEngine
  → Supabase Edge Function: home-assistant
    → resolveAIConfig(agentType, userId)
      → User AI Settings (DB) or Default Lovable
    → callAIStreaming(provider, model, messages)
      → SSE stream back to client
```

## Key Entry Points
- `src/main.tsx` — app bootstrap, QueryClient, AuthProvider
- `src/App.tsx` — router, routes définition
- `supabase/functions/_shared/ai-config.ts` — résolution hiérarchique IA

## Security
- Clés API chiffrées AES-GCM en base (jamais retournées en clair)
- Auth Supabase JWT sur toutes les routes protégées
- RLS Supabase sur toutes les tables
