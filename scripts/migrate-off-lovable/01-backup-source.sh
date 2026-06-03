#!/usr/bin/env bash
# Sauvegarde complète (filet de sécurité) du projet SOURCE avant toute opération.
set -euo pipefail
cd "$(dirname "$0")"
: "${SOURCE_DB_URL:?Renseigne SOURCE_DB_URL (voir .env)}"

OUT="backup-source-$(date +%F-%H%M).dump"
echo "→ Dump complet de la source vers $OUT"
pg_dump "$SOURCE_DB_URL" -Fc -f "$OUT"
echo "✓ Sauvegarde créée : $OUT  (restaurable via: pg_restore -d <url> $OUT)"
