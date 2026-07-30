#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL must be configured}"
: "${JWT_SECRET:?JWT_SECRET must be configured}"

# Run migrations before starting the request process so configuration failures
# are visible in Render logs instead of becoming opaque API errors.
alembic upgrade head

exec uvicorn api.main:app --host 0.0.0.0 --port "${PORT:-10000}"
