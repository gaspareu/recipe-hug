

## Unifier le code des deux chats

### Constat
Les deux interfaces de chat (page d'accueil et page recette) partagent environ 80% de code identique, tant au niveau des hooks que de l'interface. Ce plan vise a extraire les parties communes dans des modules reutilisables.

### Strategie

Extraire un hook de base et un composant d'interface commun, puis faire en sorte que `useHomeChat` et `useRecipeChat` ne soient plus que de fins wrappers de configuration.

---

### 1. Hook partage : `src/hooks/useChatEngine.ts`

Extraire toute la logique commune de streaming et de gestion d'etat dans un hook generique :

- **Streaming SSE** : la boucle de lecture `fetch` + `ReadableStream` + parsing des `data:` lines
- **Accumulation des tool calls** et execution (y compris le fallback quand `finish_reason` est absent)
- **Parsing des actions texte** (regex fallback pour les JSON inline)
- **Mode switch** : logique `pendingModeSwitchRef` + `continueWithNewAgent`
- **Gestion des messages** : `setMessages`, ajout user/assistant, nettoyage sur erreur
- **Etat partage** : `messages`, `isStreaming`, `mode`, `pendingRecipe`, `searchResults`

Le hook recoit en configuration :
- `initialMessages` : message(s) de bienvenue
- `initialMode` : `orchestration` ou `cooking`
- `activeRecipe` initial (null ou la recette)
- `handleToolCall` : fonction de dispatch des tool calls (injectee par le wrapper)
- `buildRequestBody` : fonction pour construire le body de la requete (permet d'ajouter `completedSteps` cote recette)

Les wrappers deviennent tres simples :
- `useHomeChat` : configure le mode `orchestration`, `activeRecipe: null`, et le `handleToolCall` qui gere `open_recipe` + `navigate` + sauvegarde directe en base
- `useRecipeChat` : configure le mode `cooking`, injecte la recette, ajoute `completedSteps` dans le body, et redirige `save_recipe` / `extract_modified_recipe` vers les callbacks parent

---

### 2. Composant partage : `src/components/chat/ChatInterface.tsx`

Extraire l'interface de chat commune dans un composant reutilisable :

- **Rendu des messages** : bulles user (`bg-muted rounded-3xl`) et assistant (prose + ReactMarkdown), filtrage des JSON d'action
- **Indicateur de streaming** : les 3 points animes
- **Transcript partiel** (voix)
- **Barre de saisie** : le bloc `bg-muted rounded-[24px]` avec bouton +, popover fichiers/camera/image, textarea auto-resize, bouton micro/envoi dynamique
- **Barre de suggestions** : les chips contextuelles par mode
- **Barre pending recipe** : confirmation creer/mettre a jour avec les boutons Check/X
- **Preview image** selectionnee
- **Gestion image** : selection fichier, validation type/taille, preview, suppression
- **Voice** : integration `useVoiceMode`, auto-speak des reponses assistant

Props du composant :
- `messages`, `isStreaming`, `mode`, `pendingRecipe` (etat du hook)
- `sendMessage`, `savePendingRecipe`, `cancelPendingRecipe` (actions)
- `getModeInfo` (helper)
- `suggestions` : liste de suggestions contextuelles (string[])
- `placeholder` : texte du champ de saisie
- `showWelcomeScreen` : boolean (uniquement pour Home)
- `welcomeContent` : JSX optionnel pour l'ecran d'accueil
- `headerContent` : JSX optionnel (badge de mode, boutons de navigation -- injectes par le parent)
- `className` : pour ajuster le layout (plein ecran vs sheet)

---

### 3. Simplification des pages

**`Home.tsx`** (~100 lignes au lieu de ~430) :
- Appelle `useHomeChat()` 
- Rend le header (boutons +, mode badge, navigation)
- Rend `<ChatInterface>` avec `showWelcomeScreen={true}` et les suggestions d'orchestration

**`RecipeDetail.tsx` / `RecipeChatInterface`** (~40 lignes au lieu de ~200) :
- Appelle `useRecipeChat()`
- Rend `<ChatInterface>` dans le Sheet, sans ecran d'accueil, avec les suggestions cuisine

---

### 4. Fichiers a supprimer / nettoyer

- Pas de nouveau fichier a supprimer
- Le code duplique entre les deux pages et les deux hooks est consolide

### Resultat

```text
Avant :
  useHomeChat.ts      896 lignes
  useRecipeChat.ts    483 lignes
  Home.tsx (chat UI)  ~250 lignes
  RecipeDetail.tsx (chat UI) ~200 lignes
  Total : ~1830 lignes

Apres :
  useChatEngine.ts    ~450 lignes (logique commune)
  useHomeChat.ts      ~120 lignes (wrapper)
  useRecipeChat.ts    ~80 lignes (wrapper)
  ChatInterface.tsx   ~200 lignes (UI commune)
  Home.tsx (chat)     ~100 lignes
  RecipeDetail.tsx (chat) ~40 lignes
  Total : ~990 lignes (-46%)
```

### Details techniques

Le hook `useChatEngine` expose une API identique a l'actuelle, de sorte que les wrappers n'ont qu'a passer la configuration et re-exporter les valeurs :

```text
useChatEngine({
  initialMessages,
  initialMode,
  initialActiveRecipe,
  onToolCall,          -- dispatch specifique (Home vs Recipe)
  buildRequestBody,    -- ajout completedSteps etc.
})
  --> { messages, isStreaming, mode, pendingRecipe, sendMessage, resetChat, ... }
```

La fonction `onToolCall` est le seul point de divergence significatif entre Home et Recipe : Home gere `open_recipe`, `navigate`, et la sauvegarde directe en base ; Recipe redirige vers les callbacks parent et garde le contexte recette sur `back_to_orchestration`.

