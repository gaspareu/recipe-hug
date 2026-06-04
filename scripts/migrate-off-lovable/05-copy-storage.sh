#!/usr/bin/env bash
# Copie les buckets Storage SOURCE -> CIBLE via les endpoints S3-compatibles de Supabase,
# avec rclone. Les buckets doivent d'abord exister côté cible (mêmes noms / visibilité).
set -euo pipefail
cd "$(dirname "$0")"
: "${SOURCE_S3_ENDPOINT:?}" ; : "${SOURCE_S3_ACCESS_KEY:?}" ; : "${SOURCE_S3_SECRET_KEY:?}"
: "${TARGET_S3_ENDPOINT:?}" ; : "${TARGET_S3_ACCESS_KEY:?}" ; : "${TARGET_S3_SECRET_KEY:?}"
: "${S3_REGION:=eu-west-3}"

BUCKETS=(${BUCKETS:-recipe-images avatars recipes})

RC="$(mktemp)"
cat > "$RC" <<CONF
[src]
type = s3
provider = Other
access_key_id = ${SOURCE_S3_ACCESS_KEY}
secret_access_key = ${SOURCE_S3_SECRET_KEY}
endpoint = ${SOURCE_S3_ENDPOINT}
region = ${S3_REGION}

[dst]
type = s3
provider = Other
access_key_id = ${TARGET_S3_ACCESS_KEY}
secret_access_key = ${TARGET_S3_SECRET_KEY}
endpoint = ${TARGET_S3_ENDPOINT}
region = ${S3_REGION}
CONF

for b in "${BUCKETS[@]}"; do
  echo "→ Sync bucket '$b'"
  rclone --config "$RC" sync "src:$b" "dst:$b" --progress
done
rm -f "$RC"
echo "✓ Storage copié. Vérifie que les buckets cibles ont la même visibilité (public/privé)."
