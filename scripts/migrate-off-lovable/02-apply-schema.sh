#!/usr/bin/env bash
# Applique le schéma (toutes les migrations du repo) sur le projet CIBLE.
# Rejoue supabase/migrations/ -> la contrainte provider=anthropic est en place dès le départ.
set -euo pipefail
cd "$(dirname "$0")/../.."   # racine du repo
: "${TARGET_REF:?Renseigne TARGET_REF}"
: "${SUPABASE_ACCESS_TOKEN:?Renseigne SUPABASE_ACCESS_TOKEN}"

echo "→ Link du projet cible $TARGET_REF"
supabase link --project-ref "$TARGET_REF"

echo "→ Application des migrations (supabase db push)"
supabase db push

echo "✓ Schéma appliqué sur $TARGET_REF"
