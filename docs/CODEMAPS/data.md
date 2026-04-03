<!-- Generated: 2026-03-18 | Files scanned: 2 (types.ts + migrations) | Token estimate: ~450 -->

# Data — Supabase Schema

> Source : src/integrations/supabase/types.ts (533L — types générés)

## Tables Principales

| Table | Clé | Description |
|-------|-----|-------------|
| `profiles` | user_id (FK auth.users) | Profil utilisateur, préférences |
| `recipes` | id uuid | Recettes (titre, ingrédients, steps, image_url) |
| `recipe_versions` | id, recipe_id | Historique versions recette |
| `meal_plans` | id, user_id | Plans de repas hebdomadaires |
| `meal_plan_items` | id, meal_plan_id, recipe_id | Items dans un plan |
| `ai_settings` | user_id | Config IA par user (provider, model, encrypted keys) |
| `agent_configs` | id, agent_type | Config IA par type d'agent |
| `webhook_tokens` | user_id | Tokens webhook par user |
| `recipe_shares` | id, recipe_id, token | Liens de partage recettes |
| `user_preferences` | user_id | Préférences culinaires détaillées |

## Relations Clés
```
auth.users (Supabase)
  ├── profiles (1:1)
  ├── recipes (1:N)
  ├── meal_plans (1:N) → meal_plan_items → recipes
  ├── ai_settings (1:1)
  └── user_preferences (1:1)

recipes
  ├── recipe_versions (1:N)
  └── recipe_shares (1:N)
```

## Fonctions SQL
| Fonction | Description |
|----------|-------------|
| `get_user_id_by_phone(phone)` | Résolution user_id par numéro de téléphone [NEW — migration 20260318] |

## Sécurité
- RLS activé sur toutes les tables
- Clés API AI stockées chiffrées (AES-GCM) dans `ai_settings.encrypted_key`
- Jamais retournées en clair par les edge functions
