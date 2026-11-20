#!/bin/sh
#
# Checks the database rules on a THROWAWAY copy of Postgres, on your own computer.
#
#   npm run check:db
#
# Why this exists: the other database tests read the SQL as text and check what it says.
# This one actually builds the database, signs people in, and tries to break the rules.
# It is the difference between reading a lock and turning the handle.
#
# It never touches the real test project and never needs a key. It needs Docker running.
# When it finishes, it throws the whole database away.
set -e

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
NAME=gyan-db-check
PORT=${GYAN_DB_CHECK_PORT:-55432}

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop and try again."
  echo "(This check is extra. npm run check does not need it.)"
  exit 1
fi

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

cleanup
echo "Starting a throwaway Postgres 17..."
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=check -p "$PORT":5432 postgres:17-alpine >/dev/null

i=0
until docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then echo "Postgres did not start."; exit 1; fi
  sleep 1
done

psql_run() { docker exec -i "$NAME" psql -U postgres -d gyan -v ON_ERROR_STOP=1 -q; }

docker exec "$NAME" psql -U postgres -q -c 'create database gyan;' >/dev/null
psql_run < "$HERE/01-supabase-stand-ins.sql"

echo ""
echo "Applying every database file, in order:"
for f in "$ROOT"/supabase/migrations/*.sql; do
  if psql_run < "$f" 2>/tmp/gyan-db-check-err; then
    echo "  OK   $(basename "$f")"
  else
    echo "  FAIL $(basename "$f")"
    cat /tmp/gyan-db-check-err
    exit 1
  fi
done

echo ""
echo "Trying to break the rules:"
OUT=$(docker exec -i "$NAME" psql -U postgres -d gyan -q < "$HERE/02-behaviour-checks.sql" 2>&1)
echo "$OUT" | grep -E '^---|PASS|FAIL|ERROR' | sed 's/^NOTICE:  //' | sed 's/^/  /'

PASSED=$(echo "$OUT" | grep -c 'PASS' || true)
FAILED=$(echo "$OUT" | grep -cE 'FAIL|ERROR' || true)

echo ""
if [ "$FAILED" -gt 0 ]; then
  echo "$FAILED checks FAILED, $PASSED passed."
  exit 1
fi
echo "All $PASSED checks passed. Throwing the database away."
