

# Plan : Suggestions dynamiques basées sur le dernier message de l'agent

## Problème actuel
Les suggestions sont statiques, définies par mode (`creating`, `cooking`, `editing`, `orchestration`). Elles ne tiennent pas compte du contenu de la dernière réponse de l'agent.

## Approche

Demander à l'agent IA de générer les suggestions directement dans sa réponse, via un format structuré en fin de message. C'est la méthode la plus fiable car l'agent connaît le contexte de la conversation.

### Format convention
L'agent ajoutera un bloc JSON en fin de réponse :

```
[suggestions]["Suggestion 1","Suggestion 2","Suggestion 3"][/suggestions]
```

### Modifications

**1. Edge function `home-assistant` — Mise à jour du system prompt**
- Ajouter une instruction au prompt système demandant à l'agent d'inclure 3 suggestions contextuelles à la fin de chaque réponse, dans le format `[suggestions]...[/suggestions]`.

**2. `ChatInterface.tsx` — Extraction des suggestions dynamiques**
- Parser le dernier message assistant pour extraire le bloc `[suggestions]`.
- Nettoyer le contenu affiché en retirant ce bloc du rendu markdown.
- Utiliser les suggestions extraites à la place des suggestions statiques passées en props.
- Fallback sur les suggestions statiques si aucune suggestion dynamique n'est trouvée.

**3. `Home.tsx` et `RecipeDetail.tsx` — Aucun changement majeur**
- Les suggestions statiques restent en tant que fallback (passées en props comme aujourd'hui).

### Flux

```text
Agent répond → "Voici ta recette de tarte...[suggestions][\"Ajouter des fruits\",\"Version sans gluten\",\"Lancer la cuisson\"][/suggestions]"
                              ↓
ChatInterface parse → suggestions = ["Ajouter des fruits","Version sans gluten","Lancer la cuisson"]
                    → affichage = "Voici ta recette de tarte..."
                              ↓
Boutons suggestions mis à jour dynamiquement
```

### Détails techniques

- Regex d'extraction : `\[suggestions\]\s*(\[.*?\])\s*\[\/suggestions\]/s`
- Le nettoyage du bloc se fait aussi dans le rendu des messages (là où on nettoie déjà les blocs JSON d'action)
- État local `dynamicSuggestions` dans `ChatInterface`, mis à jour à chaque nouveau message assistant

