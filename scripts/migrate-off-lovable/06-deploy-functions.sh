#!/usr/bin/env bash
# Déploie les edge functions sur la CIBLE et rappelle les secrets à définir.
set -euo pipefail
cd "$(dirname "$0")/../.."   # racine du repo
: "${TARGET_REF:?}" ; : "${SUPABASE_ACCESS_TOKEN:?}"

echo "→ Link cible $TARGET_REF"
supabase link --project-ref "$TARGET_REF"

cat <<'NOTE'
⚠️ Avant/après déploiement, définis les secrets sur la cible :
   supabase secrets set ANTHROPIC_API_KEY=... \
     AI_KEYS_ENCRYPTION_SECRET="$(openssl rand -base64 32)" \
     ELEVENLABS_API_KEY=... APP_URL=https://<ton-domaine>
   (AI_KEYS_ENCRYPTION_SECRET est un NOUVEAU secret : provider_api_keys a été vidé.)
NOTE

echo "→ Déploiement de toutes les functions"
supabase functions deploy

echo "✓ Functions déployées. verify_jwt est géré par supabase/config.toml."
