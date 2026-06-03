#!/usr/bin/env bash
# Copie les données SOURCE -> CIBLE (schéma déjà appliqué par 02).
# - public.* (toutes les tables métier)
# - auth.users + auth.identities en PRÉSERVANT les UUID (intégrité des FK user_id)
# Le Storage est traité séparément par 05-copy-storage.sh.
set -euo pipefail
cd "$(dirname "$0")"
: "${SOURCE_DB_URL:?Renseigne SOURCE_DB_URL}"
: "${TARGET_DB_URL:?Renseigne TARGET_DB_URL}"

echo "→ Dump des données publiques (source)"
pg_dump "$SOURCE_DB_URL" --data-only --no-owner --no-privileges \
  --schema=public -f data-public.sql

echo "→ Dump auth.users + auth.identities (source)"
pg_dump "$SOURCE_DB_URL" --data-only --no-owner --no-privileges \
  -t auth.users -t auth.identities -f data-auth.sql

echo "→ Chargement dans la cible (FK différées le temps de l'import)"
psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
SET session_replication_role = replica;
\i data-auth.sql
\i data-public.sql
SQL

echo "✓ Données copiées. Lance ensuite 04-post-restore.sql."
