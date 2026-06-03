# Migration Lovable Cloud → Supabase perso

Runbook pour rapatrier la base de `ggtkirrfgihghlmenrfd` (géré par Lovable Cloud)
vers ton propre projet `ifpqsyyvytfpossqycpc`.

> ⚠️ **Désactiver Lovable Cloud est IRRÉVERSIBLE.** On ne le fait qu'à la toute fin
> (étape 9), une fois la cible vérifiée de bout en bout. Avant ça, tout est additif
> et réversible : la source reste intacte.

## Prérequis

- `psql` et `pg_dump` (Postgres client ≥ 15)
- CLI Supabase : `npm i -g supabase` (ou `brew install supabase/tap/supabase`)
- `rclone` pour le Storage (`brew install rclone` / `apt install rclone`)
- Copier `.env.example` → `.env` et le remplir. **Ne pas committer `.env`.**

```sh
cd scripts/migrate-off-lovable
cp .env.example .env && $EDITOR .env
set -a && source .env && set +a   # charge les variables dans le shell
```

## Décisions actées

- **Provider IA par défaut** = `anthropic` (déjà dans les migrations du repo).
- **`AI_KEYS_ENCRYPTION_SECRET`** : introuvable côté source → on génère un **nouveau**
  secret sur la cible et on **vide `provider_api_keys`** (les utilisateurs qui avaient
  saisi leur propre clé Gemini/OpenAI devront la re-saisir ; le défaut Anthropic n'est
  pas concerné).

## Ordre des opérations

| # | Étape | Script | Réversible |
|---|-------|--------|------------|
| 0 | Préparer la source (UPDATE provider lovable→anthropic) | `00-prep-source.sql` (via éditeur SQL Lovable) | ✅ |
| 1 | Sauvegarde complète de la source | `01-backup-source.sh` | ✅ |
| 2 | Appliquer le schéma (migrations du repo) sur la cible | `02-apply-schema.sh` | ✅ |
| 3 | Copier les données + `auth.users`/`auth.identities` | `03-copy-data.sh` | ✅ |
| 4 | Nettoyage post-restore (clés chiffrées) | `04-post-restore.sql` | ✅ |
| 5 | Copier les buckets Storage | `05-copy-storage.sh` | ✅ |
| 6 | Déployer les edge functions + secrets | `06-deploy-functions.sh` | ✅ |
| 7 | OAuth Google sur le nouveau projet | manuel (voir plus bas) | ✅ |
| 8 | Repointer l'app (`.env`, `config.toml`, Vercel) + redéploy | manuel (voir plus bas) | ✅ |
| 9 | Vérifier puis **désactiver Lovable Cloud** | manuel | ❌ **dernier** |

### Étape 0 — Préparer la source (IMPORTANT)

Le schéma cible interdit déjà la valeur `lovable` (contrainte CHECK). Si la source
contient encore des lignes `provider = 'lovable'`, le chargement des données
échouera. À exécuter **sur la source**, via l'éditeur SQL de Lovable :

```sql
-- 00-prep-source.sql
UPDATE public.user_ai_settings SET provider = 'anthropic' WHERE provider = 'lovable';
```

### Étape 7 — OAuth Google

Dashboard Supabase cible → **Authentication → Providers → Google** : coller le même
Client ID / Secret, puis dans **Google Cloud Console** ajouter l'URL de callback du
nouveau projet : `https://ifpqsyyvytfpossqycpc.supabase.co/auth/v1/callback`.
Ajouter aussi l'URL de l'app dans **Authentication → URL Configuration** (Site URL +
Redirect URLs).

### Étape 8 — Repointer l'app

Mettre à jour, vers le nouveau projet :
- `.env` (local) : `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`
- `supabase/config.toml` : `project_id = "ifpqsyyvytfpossqycpc"`
- **Vercel** : mêmes variables d'env, puis redéployer.

### Étape 9 — Couper Lovable (irréversible)

Seulement après avoir validé : login email + Google, chat IA, création/lecture de
recettes, images, partage. Puis Lovable → Connectors → Lovable Cloud → Disable.

## Notes de robustesse

- `auth.users` est migré en **préservant les UUID** (sinon les `user_id` des recettes,
  plannings, etc. ne correspondraient plus). On copie `auth.users` + `auth.identities`
  en data-only avec FK différées. Les sessions ne sont pas migrées → re-login.
- Le chargement data-only utilise `SET session_replication_role = replica;` pour
  différer les contraintes FK pendant l'import.
- Chaque script est rejouable ; en cas de doute, on restaure la cible depuis zéro
  (projet neuf) — la source n'est jamais modifiée (hors étape 0).
