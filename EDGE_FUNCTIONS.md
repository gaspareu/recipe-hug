# Edge Functions — Documentation

> Référentiel des 14 fonctions backend, classées par catégorie, avec leur rôle, type d'agent IA et capabilities requises.

---

## Tableau récapitulatif

| # | Fonction | Catégorie | Agent Type | Capabilities | Lignes (≈) |
|---|----------|-----------|------------|--------------|-------------|
| 1 | `home-assistant` | Conversationnel (streaming) | `chat` | streaming, tools, vision | 1132 |
| 2 | `cooking-assistant` | Conversationnel (streaming) | `chat` (non configurable) | streaming, tools | 464 |
| 3 | `memory-assistant` | Conversationnel (streaming) | `chat` (non configurable) | streaming, tools | 419 |
| 4 | `generate-recipe` | Traitement (non-streaming) | Non configurable | — | — |
| 5 | `analyze-recipe` | Traitement (non-streaming) | Non configurable | — | — |
| 6 | `analyze-recipe-timeline` | Traitement (non-streaming) | `timeline` | tools | — |
| 7 | `extract-user-preferences` | Traitement (non-streaming) | `chat` | tools | — |
| 8 | `parse-recipe-image` | Traitement (non-streaming) | `parse_image` | vision | — |
| 9 | `generate-recipe-image` | Traitement (non-streaming) | `generate_image` | image_generation | — |
| 10 | `webhook-recipe` | Webhook / externe | `webhook` + `generate_image` | — | — |
| 11 | `manage-ai-keys` | Utilitaire (sans IA) | — | — | — |
| 12 | `validate-ai-key` | Utilitaire (sans IA) | — | — | — |
| 13 | `elevenlabs-tts` | Utilitaire (sans IA) | — | — | — |
| 14 | `elevenlabs-scribe-token` | Utilitaire (sans IA) | — | — | — |

---

## 1. Agents IA conversationnels (streaming)

### `home-assistant`
- **Rôle** : Orchestrateur central du chat. Gère les modes orchestration, création, cuisson, édition, mémoire. Détecte les intentions utilisateur, route vers les sous-modes, supporte le multimodal (images).
- **Agent Type** : `chat`
- **Capabilities** : streaming, tools, vision
- **Pattern** : Avancé (`resolveAIConfig` + `agent_configs`)
- **Note** : Plus grosse fonction du projet (~1132 lignes). Candidat prioritaire pour refactorisation.

### `cooking-assistant`
- **Rôle** : Assistant de cuisson/édition pour une recette spécifique. Guide étape par étape, suggère des substitutions, peut modifier ou créer une recette via tool calling.
- **Agent Type** : `chat` (non configurable par agent)
- **Capabilities** : streaming, tools
- **Pattern** : Simple (`getUserAISettings` + appels directs)

### `memory-assistant`
- **Rôle** : Gestion des préférences culinaires de l'utilisateur. Permet de consulter, ajouter, supprimer des préférences via tool calling.
- **Agent Type** : `chat` (non configurable par agent)
- **Capabilities** : streaming, tools
- **Pattern** : Simple (`getUserAISettings` + appels directs)

---

## 2. Agents IA de traitement (non-streaming)

### `generate-recipe`
- **Rôle** : Génère une recette complète (titre, ingrédients, étapes) à partir d'un prompt texte. Retourne du JSON structuré.
- **Agent Type** : Non configurable par agent
- **Pattern** : Simple

### `analyze-recipe`
- **Rôle** : Analyse une recette et génère un résumé, des tags nutritionnels, un score calorique et la saison.
- **Agent Type** : Non configurable par agent
- **Pattern** : Simple

### `analyze-recipe-timeline`
- **Rôle** : Analyse les étapes d'une recette pour créer un diagramme de Gantt (durée, parallélisme, tâches passives/actives). Utilise le tool calling.
- **Agent Type** : `timeline`
- **Capabilities** : tools
- **Pattern** : Avancé (`resolveAIConfig` + validation capabilities)

### `extract-user-preferences`
- **Rôle** : Analyse une conversation pour extraire automatiquement les préférences culinaires (goûts, allergies, équipement). Utilise le tool calling.
- **Agent Type** : `chat`
- **Capabilities** : tools
- **Pattern** : Avancé (`resolveAIConfig` + validation capabilities)

### `parse-recipe-image`
- **Rôle** : Extrait une recette structurée à partir d'une photo (OCR via vision IA). Inclut une protection SSRF pour les URLs d'images.
- **Agent Type** : `parse_image`
- **Capabilities** : vision
- **Pattern** : Avancé (`resolveAIConfig` + validation capabilities)

### `generate-recipe-image`
- **Rôle** : Génère une photo réaliste d'un plat à partir du titre et des ingrédients, puis la stocke dans le bucket de stockage.
- **Agent Type** : `generate_image`
- **Capabilities** : image_generation
- **Pattern** : Avancé (`resolveAIConfig` + validation capabilities)

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

---

## 5. Module partagé

### `_shared/decrypt-keys.ts`
- **Rôle** : Utilitaires de chiffrement/déchiffrement AES-GCM pour les clés API.
- **Exports** : `encryptValue`, `decryptValue`, `decryptProviderKeys`, `maskApiKey`

---

## Observations : duplication de code

### Code dupliqué dans chaque fonction IA

Chaque fonction qui utilise l'IA redéclare indépendamment :
- Les types `AIProvider`, `AISettings`, `ProviderApiKeys`
- Les fonctions `getApiKeyForProvider`, `getUserAISettings`
- Les fonctions d'appel par provider (`callLovableAI`, `callGeminiAI`, `callOpenAI`, `callAnthropicAI`)
- Les transformations de stream (`transformGeminiStreamToOpenAI`, `transformAnthropicStreamToOpenAI`)
- Les constantes `DEFAULT_MODELS`, `PROVIDER_ENDPOINTS`, `corsHeaders`

### Deux patterns coexistants

| Pattern | Fonctions | Caractéristiques |
|---------|-----------|-----------------|
| **Simple** | `analyze-recipe`, `generate-recipe`, `memory-assistant`, `cooking-assistant` | `getUserAISettings` + `callAINonStreaming` / appels directs. Pas de support `agent_configs`. |
| **Avancé** | `analyze-recipe-timeline`, `extract-user-preferences`, `parse-recipe-image`, `generate-recipe-image` | `resolveAIConfig` avec support `agent_configs` et validation de capabilities requises. |

### Piste de refactorisation

Extraire dans `_shared/` :
1. **`_shared/ai-types.ts`** — Types communs (`AIProvider`, `AISettings`, `ProviderApiKeys`, etc.)
2. **`_shared/ai-config.ts`** — `getUserAISettings`, `resolveAIConfig`, `getApiKeyForProvider`
3. **`_shared/ai-providers.ts`** — Appels provider (`callLovableAI`, `callGeminiAI`, `callOpenAI`, `callAnthropicAI`)
4. **`_shared/ai-stream.ts`** — Transformations de stream
5. **`_shared/constants.ts`** — `DEFAULT_MODELS`, `PROVIDER_ENDPOINTS`, `corsHeaders`

Toutes les fonctions convergeraient vers le pattern avancé avec `resolveAIConfig`.
