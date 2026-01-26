
# Plan : Système de Webhooks pour Créer des Recettes

## Objectif
Permettre de créer des recettes automatiquement en envoyant du contenu textuel vers l'application via un webhook HTTP. Cela permettra d'intégrer l'app avec des automatisations (Zapier, Make, IFTTT, shortcuts iOS, etc.).

## Fonctionnement

```text
┌─────────────────────┐      POST /webhook-recipe       ┌──────────────────────┐
│   Source externe    │ ─────────────────────────────▶ │   Edge Function      │
│  (Zapier, Make,     │   { "text": "...", "token": "..." }  │  webhook-recipe      │
│   Shortcuts, API)   │                                 └──────────────────────┘
└─────────────────────┘                                           │
                                                                  ▼
                                                      ┌──────────────────────┐
                                                      │   Lovable AI         │
                                                      │   (Analyse + Parse)  │
                                                      └──────────────────────┘
                                                                  │
                                                                  ▼
                                                      ┌──────────────────────┐
                                                      │   Base de données    │
                                                      │   (Nouvelle recette) │
                                                      └──────────────────────┘
```

## Détails Techniques

### 1. Nouvelle Edge Function : `webhook-recipe`

**Endpoint** : `POST /functions/v1/webhook-recipe`

**Authentification** : Clé API personnelle (token webhook)
- Pas de JWT classique car appelé depuis des systèmes externes
- Chaque utilisateur aura un token webhook unique stocké dans son profil

**Payload accepté** :
```json
{
  "text": "Contenu de la recette en texte libre...",
  "webhook_token": "token_unique_utilisateur"
}
```

**Fonctionnement** :
1. Valide le token webhook et identifie l'utilisateur
2. Envoie le texte à l'IA pour extraction structurée (titre, ingrédients, étapes)
3. Crée la recette dans la base de données
4. Retourne l'ID et le titre de la recette créée

### 2. Modifications de la Base de Données

**Nouvelle colonne dans `profiles`** :
- `webhook_token` (text, unique, nullable) : Token personnel pour les webhooks

**Fonction SQL** :
- Génération automatique du token à la demande

### 3. Interface Utilisateur (Page Profil)

Ajouter une section "Intégrations" dans le profil avec :
- Affichage du token webhook (avec bouton copier)
- Bouton pour régénérer le token
- Instructions d'utilisation avec exemples (curl, shortcuts)

### 4. Sécurité

- Token webhook unique par utilisateur (UUID)
- Rate limiting sur l'endpoint
- Validation stricte du payload (Zod)
- Longueur max du texte : 10 000 caractères
- Logging des appels pour audit

## Fichiers à Créer/Modifier

| Fichier | Action | Description |
|---------|--------|-------------|
| `supabase/functions/webhook-recipe/index.ts` | Créer | Edge Function du webhook |
| `supabase/config.toml` | Modifier | Ajouter config de la fonction |
| Migration SQL | Créer | Ajouter colonne webhook_token |
| `src/pages/Profile.tsx` | Modifier | Section gestion du token |
| `src/hooks/useWebhookToken.ts` | Créer | Hook pour gérer le token |

## Exemple d'Utilisation

### cURL
```bash
curl -X POST https://ggtkirrfgihghlmenrfd.supabase.co/functions/v1/webhook-recipe \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Tarte aux pommes : 4 pommes, 200g de farine, 100g de beurre...",
    "webhook_token": "votre-token"
  }'
```

### Shortcuts iOS
Créer un raccourci qui :
1. Récupère le texte partagé
2. Envoie une requête POST au webhook
3. Affiche une notification de confirmation

## Estimation
- Edge Function : ~150 lignes
- Migration : ~10 lignes
- UI Profil : ~100 lignes
- Hook : ~50 lignes
