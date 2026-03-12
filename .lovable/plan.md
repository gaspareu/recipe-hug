

# Refonte : Chat unifié avec skills (sans modes)

## Contexte actuel

Le chat fonctionne avec un système de **5 modes** (orchestration → creating → cooking → editing → memory) où l'agent orchestrateur détecte l'intention puis **switch de mode**, ce qui déclenche un second appel API avec un prompt spécialisé. L'assistant mémoire est une Edge Function séparée (`memory-assistant`).

**Problèmes** : complexité du double appel (continuation), latence lors des switches, code dupliqué entre modes, UI de badges de mode.

## Architecture cible

Un seul agent, un seul prompt, tous les outils disponibles en permanence. Le LLM choisit le bon outil selon le contexte naturellement.

```text
AVANT :                              APRÈS :
┌─────────────┐                      ┌─────────────┐
│ Orchestrator │──switch──►Agent B    │  Chef unifié │
│  (7 tools)   │          (2 tools)   │  (11 tools)  │
└─────────────┘                      └─────────────┘
     ↕ mode switch                    Pas de switch
     ↕ continuation call              1 seul appel
```

**Outils unifiés** (toujours disponibles) :
- `search_recipes` — recherche dans le livre
- `open_recipe` — ouvrir une recette
- `navigate` — aller au dashboard/profil
- `save_recipe` — créer une nouvelle recette (skill création)
- `extract_modified_recipe` — modifier une recette existante (skill édition)
- `create_new_recipe` — créer une variante d'une recette
- `get_preferences` — consulter le profil (skill profil)
- `update_preferences` — modifier le profil (skill profil)

Les anciens outils de **switch** (`start_cooking`, `start_editing`, `start_recipe_creation`, `start_memory`, `back_to_orchestration`) sont **supprimés** — plus besoin de router, l'agent agit directement.

## Changements techniques

### 1. Edge Function `home-assistant/index.ts`
- **Fusionner** les 4 prompts (orchestration, creating, cooking, editing) en **un seul prompt unifié** avec des sections "skills"
- **Intégrer** les outils mémoire (`get_preferences`, `update_preferences`) directement + la logique de lecture/écriture des préférences (actuellement dans `memory-assistant`)
- **Supprimer** le paramètre `mode` du `RequestSchema`
- **Supprimer** `getToolsForMode()` et `getSystemPromptForMode()` — tous les outils sont toujours fournis
- **Supprimer** la logique `isContinuation` et les `continuationInstructions`
- **Garder** le contexte de recette active (envoyé par le frontend quand on est sur une page recette)

### 2. Hook `useChatEngine.ts`
- **Supprimer** le state `mode` et tout le système de `ChatMode`
- **Supprimer** `continueWithNewAgent()`, `buildContinuationRequest`, `pendingModeSwitchRef`
- **Supprimer** `getModeInfo()` (plus de badges de mode)
- **Simplifier** `ModeSwitchResult` — les tool calls retournent directement leurs résultats

### 3. Hook `useHomeChat.ts`
- **Supprimer** les handlers de `start_cooking`, `start_editing`, `start_recipe_creation`, `start_memory`, `back_to_orchestration`
- **Ajouter** les handlers pour `get_preferences` et `update_preferences` (récupérés de `memory-assistant`)
- **Simplifier** `buildRequest` : plus de mode, un seul endpoint

### 4. Hook `useRecipeChat.ts`
- Même simplification : supprimer les modes, envoyer la recette active comme contexte
- L'agent unifié saura quoi faire avec le contexte de recette

### 5. Page `Home.tsx` et `ChatInterface.tsx`
- **Supprimer** les badges de mode, `getModeInfo`, les suggestions par mode
- Les suggestions deviennent 100% dynamiques (générées par l'IA via `[suggestions]`)

### 6. Edge Function `memory-assistant`
- **Peut être supprimée** à terme car sa logique est absorbée par `home-assistant`
- On la garde temporairement mais elle ne sera plus appelée

## Impact
- ~200 lignes supprimées dans `useChatEngine` (continuation, mode switch)
- ~100 lignes supprimées dans `useHomeChat` (handlers de switch)
- Prompt backend plus long (~+30%) mais un seul appel API au lieu de deux
- Latence réduite (plus de double appel lors des switches)

