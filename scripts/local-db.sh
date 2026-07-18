#!/usr/bin/env bash
#
# Self-contained local Postgres (with pgvector) for school-sis.
# No Docker, no cloud. The cluster data lives in ./.pgdata (git-ignored).
#
#   ./scripts/local-db.sh up      # init (first run) + start on :5433, ensure DB + pgvector
#   ./scripts/local-db.sh down    # stop
#   ./scripts/local-db.sh reset    # wipe .pgdata and re-create an empty cluster
#   ./scripts/local-db.sh status  # cluster status
#   ./scripts/local-db.sh url      # print the connection URL
#
set -euo pipefail

# Postgres tools (Homebrew Apple-Silicon / Intel, then system).
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
# macOS + PostgreSQL 16 needs a fixed locale or startup aborts with
# "postmaster became multithreaded during startup".
export LC_ALL=C

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGDATA="$ROOT/.pgdata"
PORT="${LOCAL_DB_PORT:-5433}"
DB="${LOCAL_DB_NAME:-school_sis}"
SOCKDIR="/tmp"
URL="postgresql://postgres@localhost:${PORT}/${DB}?sslmode=disable"

need() { command -v "$1" >/dev/null 2>&1 || { echo "ERROR: '$1' not found. Install PostgreSQL 16 (e.g. 'brew install postgresql@16')." >&2; exit 1; }; }

start() {
  need pg_ctl; need initdb; need createdb; need psql
  if [ ! -d "$PGDATA" ]; then
    echo "▶ initdb $PGDATA"
    initdb -D "$PGDATA" --username=postgres --auth=trust --auth-host=trust -E UTF8 >/dev/null
  fi
  if pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
    echo "▶ Postgres already running on :${PORT}"
  else
    echo "▶ starting Postgres on :${PORT}"
    pg_ctl -D "$PGDATA" -o "-p ${PORT} -k ${SOCKDIR}" -l "$PGDATA/server.log" -w start
  fi
  psql -h localhost -p "$PORT" -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB}'" 2>/dev/null | grep -q 1 \
    || createdb -h localhost -p "$PORT" -U postgres "$DB"
  if ! psql -h localhost -p "$PORT" -U postgres -d "$DB" -c "CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null 2>&1; then
    echo "⚠  Could not enable pgvector. Run ./scripts/install-pgvector.sh once, then retry." >&2
    exit 1
  fi
  echo "✔ DB ready: ${URL}"
}

stop() {
  if pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then pg_ctl -D "$PGDATA" -m fast stop; else echo "not running"; fi
}

case "${1:-up}" in
  up) start ;;
  down) stop ;;
  reset) stop || true; rm -rf "$PGDATA"; start ;;
  status) pg_ctl -D "$PGDATA" status || true ;;
  url) echo "$URL" ;;
  *) echo "usage: local-db.sh {up|down|reset|status|url}" >&2; exit 1 ;;
esac
