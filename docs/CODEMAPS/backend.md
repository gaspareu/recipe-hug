<!-- Generated: 2026-03-17 | Files scanned: 19 | Token estimate: ~500 -->

# Backend — Edge Functions (Supabase/Deno)

## Shared Modules (supabase/functions/_shared/)
```
ai-config.ts (139L)     resolveAIConfig(agentType, userId) — hiérarchique
ai-providers.ts (394L)  callAIStreaming / callAINonStreaming / callAIVision
ai-types.ts (98L)       types partagés (AIConfig, Message, Provider…)
decrypt-keys.ts (63L)   AES-GCM decrypt des clés API user
cors.ts (5L)            headers CORS

thermomix/reference.ts (327L)  référentiel machine TM7 : vitesses, températures,
                               modes, accessoires, barème + normalisation/validation
                               (miroir front : src/lib/thermomix/reference.ts)
cookidoo/mapper.ts (381L)      recette → payload Cookidoo (annotations TTS + INGREDIENT)
cookidoo/auth.ts (186L)        login PKCE/cookie Cookidoo
cookidoo/client.ts (330L)      endpoints /created-recipes (retry 429/5xx, vue appareil)
cookidoo/run-export.ts (166L)  orchestration create/update → fill → image → contrôle (ops injectées)
cookidoo/diagnostics.ts (50L)  diagnostic qualité du payload (pur)
cookidoo/types.ts (87L)        types payload + miroir du modèle recette
cookidoo/validate.ts (30L)     contrôle du payload avant tout appel réseau
```

## AI Config Resolution
```
resolveAIConfig(agentType, userId)
  1. Agent Config (DB: agent_configs) → provider + model
  2. User Settings (DB: ai_settings) → custom provider/model/key
  3. Default Anthropic (server key ANTHROPIC_API_KEY) → fallback
```

## Edge Functions
| Function | Lines | Rôle |
|----------|-------|------|
| `home-assistant` | 548 | Chat unifié : recettes, planning, navigation, vision |
| `webhook-recipe` | 341 | Réception webhook → création recette |
| `generate-recipe-image` | 211 | Génération image (vision IA) |
| `parse-recipe-image` | 187 | OCR image → recette structurée |
| `manage-ai-keys` | 178 | CRUD clés API chiffrées |
| `share-recipe` | 167 | Création lien partage |
| `validate-ai-key` | 161 | Validation clé API provider |
| `elevenlabs-tts` | 116 | Text-to-speech ElevenLabs |
| `claim-shares` | 115 | Récupération recette partagée |
| `analyze-recipe` | 109 | Analyse nutritionnelle/tags |
| `elevenlabs-scribe-token` | 80 | Token STT ElevenLabs |
| `export-recipe-cookidoo` | 282 | Export recette → Cookidoo **asynchrone** (TM7, guided cooking, anti-doublon, journal `cookidoo_exports`) |
| `manage-cookidoo-credentials` | 109 | CRUD identifiants Cookidoo chiffrés (AES-GCM) |

## Pattern Unifié
```
Edge Function
  → resolveAIConfig(agentType, userId)   # _shared/ai-config.ts
  → callAIStreaming(config, messages)     # _shared/ai-providers.ts
  → SSE response (streaming) ou JSON
```

## AI Providers Supportés
- `anthropic` (défaut) — Claude Sonnet 4 / 3.7 Sonnet / 3.5 Haiku — clé serveur `ANTHROPIC_API_KEY`
- `openai` — GPT-4o, GPT-4o-mini, o3-mini, DALL·E 3 (BYOK)
- `gemini` — Gemini 2.5 Flash/Pro, modèle image (BYOK)

> Génération d'images : Gemini ou OpenAI/DALL·E uniquement (Anthropic ne génère pas d'images).
