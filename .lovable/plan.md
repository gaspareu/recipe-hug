
# Plan : Clés API IA personnalisées

## Objectif
Permettre aux utilisateurs de configurer leurs propres clés API pour utiliser des fournisseurs IA externes (Google Gemini, OpenAI, Anthropic) à la place de Lovable AI.

## Architecture proposée

### 1. Nouvelle table `user_ai_settings`

Stockage sécurisé des paramètres IA de l'utilisateur :

```text
┌─────────────────────────────────────────────────────────────┐
│                    user_ai_settings                         │
├─────────────────────────────────────────────────────────────┤
│ id               UUID (PK)                                  │
│ user_id          UUID (FK → auth.users, UNIQUE)             │
│ provider         TEXT ('lovable' | 'gemini' | 'openai' |    │
│                        'anthropic')                         │
│ api_key          TEXT (clé chiffrée côté client)            │
│ preferred_model  TEXT (ex: 'gpt-4o', 'claude-3-5-sonnet')   │
│ created_at       TIMESTAMPTZ                                │
│ updated_at       TIMESTAMPTZ                                │
└─────────────────────────────────────────────────────────────┘
```

### 2. Interface utilisateur - Nouvelle section Profil

Une nouvelle section "Configuration IA" dans le profil :

- Sélecteur de fournisseur (radio buttons avec logos)
  - Lovable AI (défaut, gratuit inclus)
  - Google Gemini
  - OpenAI
  - Anthropic
- Champ clé API (masqué avec toggle visibilité)
- Sélecteur de modèle par fournisseur
- Bouton "Tester la connexion"
- Indicateur de statut (connecté/erreur)

### 3. Modèles disponibles par fournisseur

| Fournisseur | Modèles proposés |
|-------------|------------------|
| Lovable AI | gemini-3-flash-preview (défaut) |
| Google Gemini | gemini-2.5-flash, gemini-2.5-pro |
| OpenAI | gpt-4o, gpt-4o-mini, gpt-4-turbo |
| Anthropic | claude-3-5-sonnet, claude-3-5-haiku, claude-3-opus |

### 4. Modification des Edge Functions

Logique de routage dans toutes les fonctions IA :

```text
┌──────────────────┐     ┌────────────────────┐
│ Requête frontend │────▶│ Edge Function      │
└──────────────────┘     └────────┬───────────┘
                                  │
                         ┌────────▼────────┐
                         │ Lire settings   │
                         │ user_ai_settings│
                         └────────┬────────┘
                                  │
            ┌─────────────────────┼─────────────────────┐
            │                     │                     │
     ┌──────▼──────┐      ┌───────▼───────┐    ┌───────▼───────┐
     │ Lovable AI  │      │ Google/OpenAI │    │   Anthropic   │
     │ Gateway     │      │ Direct API    │    │   Direct API  │
     └─────────────┘      └───────────────┘    └───────────────┘
```

### 5. Sécurité

- **Chiffrement côté client** : Les clés API sont chiffrées avec une clé dérivée du mot de passe utilisateur avant stockage
- **RLS strict** : Chaque utilisateur ne peut lire/écrire que ses propres paramètres
- **Validation** : Test de connexion avant sauvegarde d'une clé
- **Pas de logs des clés** : Les clés ne sont jamais loguées dans les Edge Functions

---

## Fichiers à créer/modifier

### Nouveaux fichiers
- `src/components/profile/AIProviderSettings.tsx` - Interface de configuration
- `src/hooks/useAISettings.ts` - Hook de gestion des paramètres IA
- `supabase/functions/validate-ai-key/index.ts` - Validation des clés API

### Fichiers à modifier
- `src/pages/Profile.tsx` - Ajouter la nouvelle section
- `supabase/functions/home-assistant/index.ts` - Routage multi-fournisseur
- `supabase/functions/cooking-assistant/index.ts` - Routage multi-fournisseur
- `supabase/functions/generate-recipe/index.ts` - Routage multi-fournisseur
- `supabase/functions/analyze-recipe/index.ts` - Routage multi-fournisseur
- `supabase/functions/parse-recipe-image/index.ts` - Routage multi-fournisseur
- `supabase/functions/extract-user-preferences/index.ts` - Routage multi-fournisseur
- `supabase/functions/memory-assistant/index.ts` - Routage multi-fournisseur
- `supabase/functions/analyze-recipe-timeline/index.ts` - Routage multi-fournisseur
- `supabase/functions/generate-recipe-image/index.ts` - Routage multi-fournisseur (image)
- `supabase/functions/webhook-recipe/index.ts` - Routage multi-fournisseur

### Migration base de données
- Création de la table `user_ai_settings`
- Politiques RLS pour la nouvelle table

---

## Détails techniques

### Hook `useAISettings`

```typescript
interface AISettings {
  provider: 'lovable' | 'gemini' | 'openai' | 'anthropic';
  apiKey: string | null;
  preferredModel: string | null;
}

// Fonctions exposées
- getSettings(): AISettings
- updateSettings(settings): void
- validateKey(provider, key): Promise<boolean>
```

### Composant `AIProviderSettings`

Structure du composant :
1. Carte avec icône et description
2. Radio group pour sélection du fournisseur
3. Formulaire conditionnel (clé + modèle) si fournisseur externe
4. Bouton de test avec état de chargement
5. Messages d'erreur/succès

### Fonction utilitaire partagée pour Edge Functions

Créer un module `_shared/ai-router.ts` avec :
- `getAIConfig(userId)` - Récupère les paramètres utilisateur
- `callAI(config, messages, options)` - Appelle le bon endpoint selon le provider
- Gestion des erreurs spécifiques par fournisseur

### Endpoints API par fournisseur

| Fournisseur | Endpoint |
|-------------|----------|
| Lovable AI | `https://ai.gateway.lovable.dev/v1/chat/completions` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` |
| OpenAI | `https://api.openai.com/v1/chat/completions` |
| Anthropic | `https://api.anthropic.com/v1/messages` |

---

## Estimation

- **Complexité** : Moyenne-élevée
- **Impact** : 12 Edge Functions + 3 nouveaux fichiers + 1 migration
- **Risque** : Faible (fallback sur Lovable AI si erreur)

