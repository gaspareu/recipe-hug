# Edge Functions — Documentation

> Référentiel des 12 fonctions backend. Toutes les fonctions IA utilisent le pattern unifié `resolveAIConfig` + modules partagés `_shared/`.

---

## Architecture partagée (`_shared/`)

| Module | Exports principaux | Rôle |
|--------|--------------------|------|
| `cors.ts` | `corsHeaders` | Headers CORS centralisés |
| `ai-types.ts` | `AIProvider`, `AIConfig`, `AISettings`, `DEFAULT_MODELS`, `PROVIDER_ENDPOINTS`, `CAPABILITY_MODELS` | Types, constantes, listes de capabilities |
| `ai-config.ts` | `resolveAIConfig`, `getUserAISettings`, `getApiKeyForProvider` | Résolution hiérarchique : Agent Config → Global → Default (Lovable) |
| `ai-providers.ts` | `callAINonStreaming`, `callAIStreaming`, `buildToolCallRequest`, `extractToolCallResult`, `buildVisionRequest`, `buildSimpleRequest`, `buildRequestHeaders`, `extractContentFromResponse` | Appels IA unifiés, transforms de stream, helpers tool-calling et vision |
| `decrypt-keys.ts` | `encryptValue`, `decryptValue`, `decryptProviderKeys`, `maskApiKey` | Chiffrement/déchiffrement AES-GCM des clés API |

### Résolution de configuration (`resolveAIConfig`)

```
Agent Config (agent_configs[agentType]) → Global User Settings → Default Lovable
```

- Valide les capabilities requises (`tools`, `vision`, `image_generation`) avant sélection
- Fallback automatique vers Lovable si clé manquante ou modèle incompatible
- Supporte tous les providers : Lovable, Gemini, OpenAI, Anthropic

---

## Tableau récapitulatif

| # | Fonction | Catégorie | Agent Type | Capabilities | Pattern |
|---|----------|-----------|------------|--------------|---------|
| 1 | `home-assistant` | Streaming | `chat` | streaming, tools, vision | `resolveAIConfig` + `callAIStreaming` |
| 2 | `cooking-assistant` | Streaming | `chat` | streaming, tools | `resolveAIConfig` + `callAIStreaming` |
| 3 | `generate-recipe` | Non-streaming | `generate` | — | `resolveAIConfig` + `callAINonStreaming` |
| 4 | `analyze-recipe` | Non-streaming | `analyze` | — | `resolveAIConfig` + `callAINonStreaming` |
| 5 | `extract-user-preferences` | Non-streaming | `chat` | tools | `resolveAIConfig` + `buildToolCallRequest` |
| 6 | `parse-recipe-image` | Non-streaming | `parse_image` | vision | `resolveAIConfig` + `buildVisionRequest` |
| 7 | `generate-recipe-image` | Non-streaming | `generate_image` | image_generation | `resolveAIConfig` + custom |
| 8 | `webhook-recipe` | Webhook | `webhook` + `generate_image` | — | `resolveAIConfig` + `buildSimpleRequest` |
| 9 | `manage-ai-keys` | Utilitaire | — | — | Sans IA |
| 10 | `validate-ai-key` | Utilitaire | — | — | Sans IA |
| 11 | `elevenlabs-tts` | Utilitaire | — | — | Sans IA |
| 12 | `elevenlabs-scribe-token` | Utilitaire | — | — | Sans IA |
| 13 | `share-recipe` | Utilitaire | — | — | Sans IA |
| 14 | `claim-shares` | Utilitaire | — | — | Sans IA |

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

> **Note** : L'ancien système multi-agents (orchestrateur, `memory-assistant`, modes cooking/memory) a été supprimé au profit de cet agent unifié, réduisant la latence et la complexité.

### `cooking-assistant`
- **Rôle** : Assistant de cuisson/édition pour une recette spécifique. Guide étape par étape, suggère des substitutions, peut modifier ou créer une recette via tool calling.
- **Agent Type** : `chat`
- **Capabilities** : streaming, tools

---

## 2. Agents IA de traitement (non-streaming)

### `generate-recipe`
- **Rôle** : Génère une recette complète (titre, ingrédients, étapes) à partir d'un prompt texte. Retourne du JSON structuré.
- **Agent Type** : `generate`

### `analyze-recipe`
- **Rôle** : Analyse une recette et génère un résumé, des tags nutritionnels, un score calorique et la saison.
- **Agent Type** : `analyze`

### `extract-user-preferences`
- **Rôle** : Analyse une conversation pour extraire automatiquement les préférences culinaires (goûts, allergies, équipement). Utilise le tool calling.
- **Agent Type** : `chat`
- **Capabilities** : tools

### `parse-recipe-image`
- **Rôle** : Extrait une recette structurée à partir d'une photo (OCR via vision IA). Inclut une protection SSRF pour les URLs d'images.
- **Agent Type** : `parse_image`
- **Capabilities** : vision

### `generate-recipe-image`
- **Rôle** : Génère une photo réaliste d'un plat à partir du titre et des ingrédients, puis la stocke dans le bucket de stockage.
- **Agent Type** : `generate_image`
- **Capabilities** : image_generation

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
