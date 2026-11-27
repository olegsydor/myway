#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
docker compose --project-name myway-prod --file docker-compose.prod.yml \
    --env-file /etc/myway/production.env exec -T api python -m app.commands.auth cleanup
docker compose --project-name myway-prod --file docker-compose.prod.yml \
    --env-file /etc/myway/production.env exec -T api python -m app.commands.auth purge-deleted-accounts
