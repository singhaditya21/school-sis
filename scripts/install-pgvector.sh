#!/usr/bin/env bash
#
# One-time: build & install the pgvector extension against the local Postgres 16.
# Needed for the AI/search embedding columns. Requires git + a C toolchain
# (Xcode Command Line Tools on macOS) and the postgresql@16 dev headers.
#
#   ./scripts/install-pgvector.sh
#
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

PGVECTOR_VERSION="${PGVECTOR_VERSION:-v0.8.0}"
PG_CONFIG="$(command -v pg_config || true)"
[ -n "$PG_CONFIG" ] || { echo "ERROR: pg_config not found (install PostgreSQL 16)." >&2; exit 1; }

# Already installed?
if [ -f "$("$PG_CONFIG" --sharedir)/extension/vector.control" ]; then
  echo "✔ pgvector already installed."; exit 0
fi

BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT
echo "▶ cloning pgvector ${PGVECTOR_VERSION}"
git clone --depth 1 --branch "$PGVECTOR_VERSION" https://github.com/pgvector/pgvector.git "$BUILD_DIR/pgvector" >/dev/null 2>&1
cd "$BUILD_DIR/pgvector"
echo "▶ building against $("$PG_CONFIG" --version)"
make PG_CONFIG="$PG_CONFIG" >/dev/null
make install PG_CONFIG="$PG_CONFIG" >/dev/null
echo "✔ pgvector installed. Enable per-database with: CREATE EXTENSION vector;"
