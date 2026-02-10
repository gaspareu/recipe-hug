
# Documentation des Edge Functions

## Objectif
Creer un fichier `.md` a la racine du projet qui repertorie toutes les fonctions backend, leur role, leur type d'agent IA, et les patterns de code utilises.

## Contenu du fichier `EDGE_FUNCTIONS.md`

### 14 fonctions identifiees, classees en 4 categories :

---

### 1. Agents IA conversationnels (streaming)
| Fonction | Role | Agent Type | Capabilities requises |
|---|---|---|---|
| `home-assistant` | Orchestrateur central du chat. Gere les modes orchestration, creation, cuisson, edition, memoire. Detecte les intentions, route vers les sous-modes, supporte le multimodal (images). **1132 lignes** - la plus grosse fonction. | `chat` | streaming, tools, vision |
| `cooking-assistant` | Assistant de cuisson/edition pour une recette specifique. Guide etape par etape, suggere des substitutions, peut modifier ou creer une recette via tool calling. **464 lignes** | `chat` (non configurable par agent) | streaming, tools |
| `memory-assistant` | Gestion des preferences culinaires de l'utilisateur. Permet de consulter, ajouter, supprimer des preferences via tool calling. **419 lignes** | `chat` (non configurable par agent) | streaming, tools |

### 2. Agents IA de traitement (non-streaming)
| Fonction | Role | Agent Type | Capabilities requises |
|---|---|---|---|
| `generate-recipe` | Genere une recette complete (titre, ingredients, etapes) a partir d'un prompt texte. Retourne du JSON. | Non configurable par agent | - |
| `analyze-recipe` | Analyse une recette et genere un resume, des tags nutritionnels, un score calorique et la saison. | Non configurable par agent | - |
| `analyze-recipe-timeline` | Analyse les etapes d'une recette pour creer un diagramme de Gantt (duree, parallelisme, taches passives/actives). Utilise le tool calling. | `timeline` | tools |
| `extract-user-preferences` | Analyse une conversation pour extraire automatiquement les preferences culinaires (gouts, allergies, equipement). Utilise le tool calling. | `chat` | tools |
| `parse-recipe-image` | Extrait une recette structuree a partir d'une photo (OCR via vision IA). Inclut une protection SSRF. | `parse_image` | vision |
| `generate-recipe-image` | Genere une photo realiste d'un plat a partir du titre et des ingredients, puis la stocke dans le bucket. | `generate_image` | image_generation |

### 3. Services webhook / externes
| Fonction | Role | Agent Type |
|---|---|---|
| `webhook-recipe` | Point d'entree externe (ex: Home Assistant). Recoit du texte, extrait une recette via IA, la sauvegarde, et declenche la generation d'image en arriere-plan. Authentification par webhook token (pas JWT). | `webhook` + `generate_image` |

### 4. Services utilitaires (sans IA)
| Fonction | Role |
|---|---|
| `manage-ai-keys` | CRUD securise des cles API. Chiffre les cles (AES-GCM) a l'ecriture, retourne des cles masquees a la lecture. |
| `validate-ai-key` | Teste la validite d'une cle API en faisant un appel minimal au provider (Gemini, OpenAI, Anthropic). |
| `elevenlabs-tts` | Convertit du texte en audio MP3 via l'API ElevenLabs (Text-to-Speech). |
| `elevenlabs-scribe-token` | Genere un token usage unique pour le service ElevenLabs Scribe (transcription temps reel). |

### 5. Module partage
| Fichier | Role |
|---|---|
| `_shared/decrypt-keys.ts` | Utilitaires de chiffrement/dechiffrement AES-GCM pour les cles API. Exporte `encryptValue`, `decryptValue`, `decryptProviderKeys`, `maskApiKey`. |

---

### Observation : duplication massive de code

**Probleme identifie** : Chaque fonction qui utilise l'IA re-declare independamment :
- Les types `AIProvider`, `AISettings`, `ProviderApiKeys`
- Les fonctions `getApiKeyForProvider`, `getUserAISettings`
- Les fonctions d'appel par provider (`callLovableAI`, `callGeminiAI`, `callOpenAI`, `callAnthropicAI`)
- Les transformations de stream (`transformGeminiStreamToOpenAI`, `transformAnthropicStreamToOpenAI`)
- Les constantes `DEFAULT_MODELS`, `PROVIDER_ENDPOINTS`, `corsHeaders`

Deux patterns coexistent sans raison technique :
1. **Pattern "simple"** (`analyze-recipe`, `generate-recipe`, `memory-assistant`) : `getUserAISettings` + `callAINonStreaming` sans support `agent_configs`
2. **Pattern "avance"** (`analyze-recipe-timeline`, `extract-user-preferences`, `parse-recipe-image`, `generate-recipe-image`) : `resolveAIConfig` avec support `agent_configs` et validation de capacites

Le fichier documentera cet etat pour servir de base a une future refactorisation.

---

## Fichier a creer
- `EDGE_FUNCTIONS.md` : documentation complete avec tableau recapitulatif, description de chaque fonction, et notes sur la duplication de code.

