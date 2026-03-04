

# Inventaire des prompts et plan de révision du ton

## Où sont les prompts

Tous les prompts sont dans les **edge functions backend** (`supabase/functions/`). Il y a **6 fichiers** contenant des prompts système :

### 1. `home-assistant/index.ts` — Le cœur du chat (4 prompts + 1 instruction)

| Prompt | Ligne | Rôle | Ton actuel |
|---|---|---|---|
| `ORCHESTRATION_PROMPT` | L.70 | Chef d'orchestre, détecte les intentions, route vers les modes | "Chaleureux, enthousiaste, professionnel, tutoie" |
| `CREATING_PROMPT` | L.135 | Création de recettes, guide de l'idée à la sauvegarde | "Chef 20 ans d'expérience, chaleureux, enthousiaste, naturel" |
| `COOKING_PROMPT` | L.170 | Guidage pas-à-pas pendant la cuisine | "Chaleureux, encourageant, expert culinaire français" |
| `EDITING_PROMPT` | L.191 | Modification de recettes existantes | "Créatif, expert culinaire, bienveillant" |
| `SUGGESTIONS_INSTRUCTION` | L.557 | Instruction technique pour générer les suggestions dynamiques | (pas de ton, purement technique) |

### 2. `memory-assistant/index.ts` — Gestion des préférences

| Prompt | Ligne | Rôle | Ton actuel |
|---|---|---|---|
| `MEMORY_PROMPT` | L.20 | Consultation/modification des préférences culinaires | "Chaleureux, bienveillant, tutoie, emojis" |

### 3. `generate-recipe/index.ts` — Génération rapide

| Prompt | Ligne | Rôle | Ton actuel |
|---|---|---|---|
| `systemPrompt` | L.12 | Génère une recette complète en JSON | "Chef 20 ans, recettes gourmandes, astuces de chef" |

### 4. `analyze-recipe/index.ts` — Analyse automatique

| Prompt | Ligne | Rôle | Ton actuel |
|---|---|---|---|
| Prompt inline | L.69 | Analyse nutritionnelle, tags, saison | Pas de personnalité (prompt technique) |

### 5. `parse-recipe-image/index.ts` — OCR de recettes

| Prompt | Ligne | Rôle | Ton actuel |
|---|---|---|---|
| `SYSTEM_PROMPT` | L.42 | Extraction de recettes depuis des images | Pas de personnalité (prompt technique) |

### 6. `extract-user-preferences/index.ts` — Extraction de préférences

| Prompt | Ligne | Rôle | Ton actuel |
|---|---|---|---|
| `EXTRACTION_PROMPT` | L.18 | Extraction passive de préférences depuis les conversations | Pas de personnalité (prompt technique) |

---

## Ce qu'il faut décider

Pour réviser le ton, les prompts à travailler sont ceux qui **parlent à l'utilisateur** (les 5 premiers + memory). Les 3 prompts techniques (analyze, parse-image, extract-preferences) n'ont pas besoin de ton car ils retournent du JSON brut.

**Questions clés avant d'implémenter :**

1. **Personnalité globale** — Quel ton veux-tu ? Exemples : plus décontracté/familier, plus sobre/professionnel, plus humoristique, plus concis ?
2. **Nom de l'assistant** — Il s'appelle "Chef" partout. Tu veux garder ce nom ou le changer ?
3. **Tutoiement** — Tu veux garder le tutoiement ou passer au vouvoiement ?
4. **Emojis** — Le memory-assistant utilise des emojis. Tu veux en ajouter partout, les supprimer, ou garder le mix actuel ?
5. **Longueur des réponses** — Les prompts demandent des réponses "concises". Tu veux des réponses plus détaillées ou garder ce style ?

## Plan d'implémentation

Une fois le nouveau ton défini :

1. **Rédiger un bloc "identité" commun** — Un paragraphe de référence (nom, ton, style, règles) réutilisable
2. **Mettre à jour les 5 prompts conversationnels** dans `home-assistant/index.ts` (orchestration, creating, cooking, editing) et `memory-assistant/index.ts`
3. **Mettre à jour le prompt de `generate-recipe/index.ts`** pour aligner le style des recettes générées
4. **Redéployer les 3 edge functions modifiées**

Fichiers impactés :
- `supabase/functions/home-assistant/index.ts`
- `supabase/functions/memory-assistant/index.ts`
- `supabase/functions/generate-recipe/index.ts`

