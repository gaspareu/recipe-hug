

## Probleme

L'agent mémoire (`memory-assistant`) ne connait pas le champ `special_ingredients` de `taste_preferences`. Trois lacunes :

1. **Prompt systeme** : la section "Structure des preferences" ne mentionne pas `special_ingredients`
2. **Formatage** : `formatPreferencesForPrompt()` n'affiche pas les aliments particuliers
3. **Outil update** : le schema de l'outil `update_preferences` ne documente pas ce champ, donc l'IA ne sait pas qu'il existe

## Corrections dans `supabase/functions/memory-assistant/index.ts`

### 1. Prompt — ajouter `special_ingredients` dans la section Gouts

Sous `disliked_ingredients`, ajouter :
```
- special_ingredients : aliments particuliers a utiliser si pertinent (kombu, citrons confits, pate d'agrumes...)
```

### 2. `formatPreferencesForPrompt` — afficher les aliments particuliers

Apres la ligne `disliked_ingredients`, ajouter :
```typescript
if (taste.special_ingredients?.length > 0)
  tasteParts.push(`Aliments particuliers : ${taste.special_ingredients.join(", ")}`);
```

### 3. Outil `update_preferences` — documenter le champ

Ajouter dans la description de `field` ou dans la description generale de l'outil une mention que `special_ingredients` est un champ valide de `taste_preferences`.

### 4. Re-deployer la fonction

Deployer `memory-assistant` pour appliquer les changements.

---

Aucune modification de base de donnees ou de RLS n'est necessaire : `special_ingredients` est stocke dans la colonne JSONB `taste_preferences` de `user_culinary_preferences`, qui a deja les bonnes policies.

