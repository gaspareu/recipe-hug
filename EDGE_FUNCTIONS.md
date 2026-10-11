# Edge Functions — Documentation

> Référentiel des 13 fonctions backend. Toutes les fonctions IA utilisent le pattern unifié `resolveAIConfig` + modules partagés `_shared/`.
> Pour le déploiement et les secrets, voir **`supabase/functions/AGENTS.md`**.

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
| `cookidoo/{mapper,validate,client,auth,types}.ts` | `mapRecipeToCookidoo`, `validateCookidooPayload`, `createRecipe`, `fillRecipe`, `setRecipeImage`, `login` | Connecteur Cookidoo (export TM7, annotations guided cooking). Détail : `supabase/functions/AGENTS.md` |

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

Règle : Anthropic ne génère pas d'images → `generate-recipe-image` utilise `defaultProvider: "openai"` avec GPT Image 2.5 Flare.

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
| 13 | `export-recipe-cookidoo` | Préparation + export | Config utilisateur | Sonnet 5.5 par défaut | Copie TM7 persistante à la demande, aperçu signé, puis export confirmé et relu |

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
- **Provider par défaut** : OpenAI (`gpt-image-2.5-flare`) via `OPENAI_API_KEY` serveur
- **Repli** : clé OpenAI utilisateur si le secret serveur manque, puis Gemini si aucune clé OpenAI n'est disponible
- **API** : Images (`/v1/images/generations`), JPEG 1536×864 ; `response_format` est omis pour les modèles GPT Image
- **Réponse** : `data[0].b64_json` ; Gemini reste disponible sur choix explicite
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
- **Sécurité/résilience** : JWT obligatoire, méthode POST uniquement, voix française imposée côté serveur, texte limité à 5 000 caractères, quota atomique par utilisateur + global, délai amont de 20 s et propagation contrôlée des statuts 429/5xx. L'audio est relayé en streaming sans journaliser le texte côté application.

### `elevenlabs-scribe-token`
- **Rôle** : Génère un token à usage unique pour le service ElevenLabs Scribe (transcription temps réel).
- **Sécurité/résilience** : JWT et POST obligatoires, quota atomique par utilisateur + global, réponse non mise en cache, délai amont de 20 s et validation stricte du token retourné.

Les deux fonctions lisent `ELEVENLABS_ZERO_RETENTION_MODE`. La valeur par défaut conserve la journalisation fournisseur ; `true` ne doit être activé que si le compte ElevenLabs est éligible au Zero Retention Mode.

### `share-recipe`
- **Rôle** : Crée un partage de recette vers un destinataire (email ou identifiant).

### `claim-shares`
- **Rôle** : Réclame les recettes partagées en attente pour l'utilisateur connecté.

---

## 5. Tests

### `_shared/decrypt-keys_test.ts`
- 9 tests Deno couvrant le roundtrip chiffrement/déchiffrement, les caractères spéciaux, les IVs aléatoires et la validation base64.
- Exécution : `deno test supabase/functions/_shared/decrypt-keys_test.ts`

## Adaptation Cookidoo à la demande

`home-assistant` génère des recettes classiques sans paramètres TM7. La fiche appelle
`export-recipe-cookidoo` (`cookidoo_adaptation_v2`) pour préparer une copie conservée dans
`recipe_cookidoo_adaptations`, puis l’envoyer après vérification. La recette source reste
intacte. Les migrations du 10 octobre 2026 doivent précéder le déploiement des fonctions.
Le frontend vérifie la capacité du backend avant toute préparation ou tout envoi.
Voir le guide opérationnel `supabase/functions/AGENTS.md` pour les reprises et confirmations.


## Diagnostic des adaptations Cookidoo

Les logs Supabase de `export-recipe-cookidoo` préfixés `[cookidoo-adaptation]`
sont des événements JSON : `started`, `completed`, `failed` et
`failure_journal_failed`. `attempt_id` relie les traces à la tentative stockée
sur `recipe_cookidoo_adaptations` ; `adapter_version` identifie le contrat.
`duration_ms` mesure le temps depuis le début de la tâche de fond.

En cas d'échec, `stage` distingue quota, configuration IA, génération,
validation de l'adaptation, mapping Cookidoo et persistance. `reason` est un
code fermé (par exemple `invalid_json`, `manual_instruction_changed` ou
`quantities_changed`). Pour un schéma invalide, seuls les codes et les chemins
de cinq erreurs maximum sont inclus, avec le nombre total d'erreurs ; les
clés inconnues sont masquées. Pour un refus HTTP du fournisseur IA, seul le
statut numérique est ajouté. Sentry reçoit un code normalisé incluant étape
et cause, sans identifiant de tentative.

Aucune recette, réponse IA, exception brute, clé API, information Cookidoo ou
identité utilisateur n'est incluse dans ces nouveaux événements. Le code
public `adaptation_failed` et les contrôles de validation restent inchangés.
Après déploiement, relancer une préparation pour obtenir ces diagnostics :
ils ne peuvent pas reconstituer la réponse des anciennes tentatives.


## Contrat IA et réparation Cookidoo

L'adaptateur `cookidoo-classic-v2` exige une vitesse sous forme de chaîne et
un tableau `uses` sur chaque étape, même sans ajout (`[]`). Seule une vitesse
numérique exactement compatible avec le référentiel est convertie en chaîne :
aucun arrondi, aucune quantité ni réglage manquant n'est déduit.

Après une réponse invalide, une seule réparation IA est permise, avec les
erreurs normalisées et la source initiale. Le JSON corrigé repasse l'ensemble
des contrôles de schéma, ingrédients, quantités, actions manuelles et sécurité
machine. Une erreur fournisseur n'est pas réessayée. Les deux appels partagent
le même délai global de 60 secondes et une préparation consomme une seule
unité du quota existant. L'aperçu et sa confirmation restent obligatoires.

Les événements `generation`, `validation`, `normalized`, `validation_failed`
et `repair_succeeded` portent `attempt` (1 ou 2). `normalized_speeds` est un
compteur ; les diagnostics sont filtrés comme les logs d'échec existants.
Aucun contenu de proposition IA n'est journalisé. Le changement de version
invalide les adaptations mises en cache avec l'ancien contrat, sans modifier
la recette du Livre ni les exports déjà envoyés.
