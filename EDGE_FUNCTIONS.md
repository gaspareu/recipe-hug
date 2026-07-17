# Edge Functions — Documentation

> Référentiel des 13 fonctions backend. Toutes les fonctions IA utilisent le pattern unifié `resolveAIConfig` + modules partagés `_shared/`.
> Pour le déploiement et les secrets, voir **`supabase/functions/CLAUDE.md`**.

---

## Architecture partagée (`_shared/`)

| Module | Exports principaux | Rôle |
|--------|--------------------|------|
| `cors.ts` | `corsHeaders` | Headers CORS centralisés |
| `ai-types.ts` | `AIProvider`, `AIConfig`, `AISettings`, `DEFAULT_MODELS`, `PROVIDER_ENDPOINTS`, `CAPABILITY_MODELS` | Types, constantes, listes de capabilities |
| `ai-config.ts` | `resolveAIConfig`, `getUserAISettings`, `getApiKeyForProvider` | Résolution hiérarchique : Agent Config → Global → Default (Anthropic) |
| `ai-providers.ts` | `callAINonStreaming`, `callAIStreaming`, `buildToolCallRequest`, `extractToolCallResult`, `buildVisionRequest`, `buildSimpleRequest`, `buildRequestHeaders`, `extractContentFromResponse` | Appels IA unifiés, transforms de stream, helpers tool-calling et vision |
| `decrypt-keys.ts` | `encryptValue`, `decryptValue`, `decryptProviderKeys`, `maskApiKey` | Chiffrement/déchiffrement AES-GCM des clés API |
| `thermomix/reference.ts` | `TM7_MODES`, `TM7_CONVERSION_CHEATSHEET`, `normalizeSpeed`, `clampTemperature`, `buildTm7ReferenceForPrompt` | **Référentiel machine TM7** (vitesses, températures, modes, accessoires, barème). Miroir front synchronisé : `src/lib/thermomix/reference.ts` |
| `cookidoo/{mapper,validate,client,auth,types}.ts` | `mapRecipeToCookidoo`, `validateCookidooPayload`, `createRecipe`, `fillRecipe`, `setRecipeImage`, `login` | Connecteur Cookidoo (export TM7, annotations guided cooking). Détail : `supabase/functions/CLAUDE.md` |

### Résolution de configuration (`resolveAIConfig`)

```
Agent Config (agent_configs[agentType]) → Global User Settings → defaultProvider (serveur)
```

Options de `ResolveOptions` :
- `agentType` — identifiant de l'agent (ex : `"generate_image"`, `"chat"`)
- `defaultModel` — modèle du fallback serveur
- `defaultProvider` — provider du fallback serveur (`"gemini"` | `"openai"` | `"anthropic"`, défaut : `"anthropic"`)
- `requiredCapabilities` — valide avant sélection, fallback si non satisfait

Clés serveur utilisées selon `defaultProvider` :
- `"anthropic"` → `ANTHROPIC_API_KEY`
- `"gemini"` → `GEMINI_API_KEY`
- `"openai"` → `OPENAI_API_KEY`

Règle : Anthropic ne génère pas d'images → `generate-recipe-image` utilise `defaultProvider: "gemini"`.

---

## Tableau récapitulatif

| # | Fonction | Catégorie | Agent Type | Capabilities | Pattern |
|---|----------|-----------|------------|--------------|---------|
| 1 | `home-assistant` | Streaming | `chat` | streaming, tools, vision | `resolveAIConfig` + `callAIStreaming` |
| 2 | `analyze-recipe` | Non-streaming | `analyze` | — | `resolveAIConfig` + `callAINonStreaming` |
| 3 | `parse-recipe-image` | Non-streaming | `parse_image` | vision | `resolveAIConfig` + `buildVisionRequest` |
| 4 | `generate-recipe-image` | Non-streaming | `generate_image` | image_generation | `resolveAIConfig` + custom |
| 5 | `webhook-recipe` | Webhook | `webhook` + `generate_image` | — | `resolveAIConfig` + `buildSimpleRequest` |
| 6 | `manage-ai-keys` | Utilitaire | — | — | Sans IA |
| 7 | `validate-ai-key` | Utilitaire | — | — | Sans IA |
| 8 | `elevenlabs-tts` | Utilitaire | — | — | Sans IA |
| 9 | `elevenlabs-scribe-token` | Utilitaire | — | — | Sans IA |
| 10 | `share-recipe` | Utilitaire | — | — | Sans IA |
| 11 | `claim-shares` | Utilitaire | — | — | Sans IA |
| 12 | `manage-cookidoo-credentials` | Utilitaire | — | — | Sans IA (AES-GCM) |
| 13 | `export-recipe-cookidoo` | Utilitaire | — | — | Sans IA (export TM7) |

---

## 1. Agent IA principal (streaming, unifié)

### `home-assistant`
- **Rôle** : Agent conversationnel unique du chat d'accueil. Regroupe **tous les skills** en un seul prompt :
  - **Création de recette** : génère des recettes structurées via `save_recipe`
  - **Gestion des préférences** : consulte/modifie les goûts, allergies, équipement via `update_preferences`
  - **Planification de repas** : propose un planning hebdomadaire et le sauvegarde via `save_meal_plan`
  - **Navigation** : redirige vers les pages de l'app via `navigate`
  - **Multimodal** : analyse les images envoyées (photos de plats, pages de recettes)
- **Agent Type** : `chat`
- **Capabilities** : streaming, tools, vision
- **Outils disponibles** : `save_recipe`, `update_preferences`, `navigate`, `save_meal_plan`

> **Note** : L'ancien système multi-agents (orchestrateur, `cooking-assistant`, `memory-assistant`, modes cooking/memory) a été supprimé au profit de cet agent unifié, réduisant la latence et la complexité. L'assistant de cuisson lié à une recette (`useRecipeChat` côté frontend) appelle désormais directement `home-assistant`.

---

## 2. Agents IA de traitement (non-streaming)

> `generate-recipe` et `extract-user-preferences` ont été supprimées (code mort) :
> le chat unifié `home-assistant` couvre ces usages via ses tools `save_recipe`
> et `update_preferences`.

### `analyze-recipe`
- **Rôle** : Analyse une recette et génère un résumé, des tags nutritionnels, un score calorique et la saison.
- **Agent Type** : `analyze`

### `parse-recipe-image`
- **Rôle** : Extrait une recette structurée à partir d'une photo (OCR via vision IA). Inclut une protection SSRF pour les URLs d'images.
- **Agent Type** : `parse_image`
- **Capabilities** : vision

### `generate-recipe-image`
- **Rôle** : Génère une photo réaliste d'un plat à partir du titre et des ingrédients, puis la stocke dans le bucket de stockage.
- **Agent Type** : `generate_image`
- **Capabilities** : image_generation
- **Provider par défaut** : Gemini (`gemini-2.5-flash-image`) via `GEMINI_API_KEY` serveur
- **API** : Native Gemini (`/v1beta/models/{model}:generateContent`) — **pas** l'endpoint OpenAI-compat
- **Réponse** : `candidates[0].content.parts[].inlineData` (base64 + mimeType)
- **verify_jwt** : `true` (modifie Storage + DB)

---

## 3. Services webhook / externes

### `webhook-recipe`
- **Rôle** : Point d'entrée externe (ex : Home Assistant). Reçoit du texte, extrait une recette via IA, la sauvegarde, et déclenche la génération d'image en arrière-plan.
- **Authentification** : Token webhook (pas JWT) — stocké dans `profiles.webhook_token`.
- **Agent Types utilisés** : `webhook` + `generate_image`

---

## 4. Services utilitaires (sans IA)

### `manage-ai-keys`
- **Rôle** : CRUD sécurisé des clés API utilisateur. Chiffre les clés (AES-GCM) à l'écriture, retourne des clés masquées à la lecture.

### `validate-ai-key`
- **Rôle** : Teste la validité d'une clé API en faisant un appel minimal au provider (Gemini, OpenAI, Anthropic).

### `elevenlabs-tts`
- **Rôle** : Convertit du texte en audio MP3 via l'API ElevenLabs (Text-to-Speech).

### `elevenlabs-scribe-token`
- **Rôle** : Génère un token à usage unique pour le service ElevenLabs Scribe (transcription temps réel).

### `share-recipe`
- **Rôle** : Crée un partage de recette vers un destinataire (email ou identifiant).

### `claim-shares`
- **Rôle** : Réclame les recettes partagées en attente pour l'utilisateur connecté.

---

## 5. Tests

### `_shared/decrypt-keys_test.ts`
- 9 tests Deno couvrant le roundtrip chiffrement/déchiffrement, les caractères spéciaux, les IVs aléatoires et la validation base64.
- Exécution : `deno test supabase/functions/_shared/decrypt-keys_test.ts`
