#!/bin/sh
# Run from a local Docker host with no other stack using 172.30.24.0/24.
set -eu
cd "$(dirname "$0")/../.."
umask 077
work=$(mktemp -d "${TMPDIR:-/tmp}/myway-cp2.XXXXXX")
project=$(basename "$work" | tr '[:upper:]' '[:lower:]' | tr '.' '-')
env_file="$work/smoke.env"
origin=https://localhost:18443

compose() {
    docker compose --project-name "$project" --file docker-compose.prod.yml \
        --file deploy/smoke/compose.yml --env-file "$env_file" "$@"
}

context=$(docker context show)
endpoint=$(docker context inspect "$context" --format '{{.Endpoints.docker.Host}}')
case "${DOCKER_HOST:-$endpoint}" in
    unix://*) ;;
    *) echo "Use the local Docker Unix socket for this smoke test." >&2; exit 1 ;;
esac

# Compose gives inherited variables precedence over its explicit env file.
unset MYWAY_RELEASE SMOKE_DIR PUBLIC_ORIGIN MYWAY_HTTP_BIND MYWAY_HTTPS_BIND \
    CADDY_TLS_DIRECTIVE CADDY_WWW_SITE POSTGRES_ADMIN_PASSWORD POSTGRES_MIGRATION_PASSWORD \
    POSTGRES_PASSWORD AUTH_SECRET SMTP_HOST SMTP_PORT SMTP_FROM SMTP_USERNAME SMTP_PASSWORD \
    REGISTRATION_ENABLED COMPOSE_PROFILES

cat > "$env_file" <<ENV
MYWAY_RELEASE=$project
SMOKE_DIR='$work'
PUBLIC_ORIGIN=$origin
MYWAY_HTTP_BIND=127.0.0.1:18080
MYWAY_HTTPS_BIND=127.0.0.1:18443
CADDY_TLS_DIRECTIVE=tls internal
POSTGRES_ADMIN_PASSWORD='dummy admin @ : / % #'
POSTGRES_MIGRATION_PASSWORD='dummy migrator @ : / % #'
POSTGRES_PASSWORD='dummy runtime @ : / % #'
AUTH_SECRET='cp2-local-synthetic-secret-only-0123456789abc'
SMTP_HOST=smtp
SMTP_PORT=1587
SMTP_FROM='MyWay <noreply@localhost>'
SMTP_USERNAME=cp2-local
SMTP_PASSWORD=cp2-local-smtp
ENV
echo "Smoke project and release: $project"
echo "Smoke evidence and synthetic backup: $work"
finish() {
    compose logs --no-color db api caddy smtp > "$work/services.log" || true
    compose down >/dev/null
}
trap finish EXIT
mkdir "$work/mail"
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj /CN=smtp \
    -addext subjectAltName=DNS:smtp -keyout "$work/smtp.key" -out "$work/smtp.crt"
chmod 644 "$work/smtp.crt"

check() {
    python3 deploy/smoke/check.py "$@" --ca "$work/caddy-ca.crt" --mail "$work/mail"
}

sql() {
    compose exec -T db sh -ec 'psql -XAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"' sh "$1"
}

compose config --quiet
compose build api caddy
compose run --rm --no-deps api python -c 'from app.core.config import get_settings; get_settings()'
if compose run --rm --no-deps -e SMTP_PASSWORD=replace-local-placeholder api \
    python -c 'from app.core.config import get_settings; get_settings()' > "$work/rejected-config.log" 2>&1
then
    echo "Production accepted a placeholder SMTP password." >&2
    exit 1
fi
grep -q 'Production requires private database and SMTP credentials' "$work/rejected-config.log"
if grep -q 'replace-local-placeholder' "$work/rejected-config.log"; then
    echo "Production validation logged a placeholder credential value." >&2
    exit 1
fi
docker run --rm --network none -e PUBLIC_ORIGIN=https://mywaygraph.com \
    -e CADDY_WWW_SITE=www.mywaygraph.com "myway/edge:$project" \
    caddy validate --config /etc/caddy/Caddyfile
compose up -d --wait db smtp
compose run --rm migrate
compose run --rm migrate
test "$(sql 'SELECT version_num FROM alembic_version')" = a24a01e4b901
test "$(sql "SELECT count(*) FROM pg_roles WHERE rolname IN ('myway_runtime','myway_migrate') AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication)")" = 2
test "$(sql "SELECT has_schema_privilege('myway_runtime', 'public', 'CREATE')")" = f
compose up -d --wait --no-build api caddy
attempt=0
until compose exec -T caddy cat /data/caddy/pki/authorities/local/root.crt > "$work/caddy-ca.crt" 2>/dev/null &&
    curl --silent --fail --cacert "$work/caddy-ca.crt" "$origin/api/health" >/dev/null
do
    attempt=$((attempt + 1))
    test "$attempt" -lt 15
    sleep 1
done
check prelaunch

for service in api db; do
    container=$(compose ps -q "$service")
    test "$(docker inspect --format '{{len .HostConfig.PortBindings}}' "$container")" = 0
done
if compose exec -T caddy getent hosts db; then
    echo "Database resolves on the edge network." >&2
    exit 1
fi

(export REGISTRATION_ENABLED=true; compose up -d --wait --no-build api)
check lifecycle
compose up -d --wait --no-build api
# Expire only this synthetic account's mail cooldown so the reset can run immediately.
sql "DELETE FROM auth_rate_limits WHERE key=encode(sha256(convert_to('mail:cooldown:cp2-a@example.com', 'UTF8')), 'hex')"
check reset
owner_id=$(sql "SELECT id FROM users WHERE email_normalized='cp2-a@example.com'")
compose exec -T api python -m app.commands.auth grant-pro "$owner_id" --source manual
check workspace --plan pro

# These containers present distinct TCP peers to Caddy. The 11th attempt from the first
# peer must be throttled despite changing spoofed headers. The second peer gets its own bucket.
for pair in '10 11 ipv4' '11 1 ipv4' '12 1 ipv6'; do
    set -- $pair
    docker run --rm --network "${project}_proxy" --ip "172.30.24.$1" \
        -v "$PWD/deploy/smoke/check.py:/check.py:ro" -v "$work/caddy-ca.crt:/ca.crt:ro" \
        --user "$(id -u):$(id -g)" "myway/backend:$project" \
        python /check.py rate --ca /ca.crt --attempts "$2" --family "$3"
done

# Preserve one future deletion and make the other due, then run both maintenance commands.
sql "UPDATE users SET deletion_due_at=now()+interval '1 day' WHERE email_normalized='cp2-a@example.com'"
compose exec -T api python -m app.commands.auth cleanup
compose exec -T api python -m app.commands.auth purge-deleted-accounts
test "$(sql "SELECT count(*) FROM users WHERE email_normalized IN ('cp2-a@example.com','cp2-b@example.com')")" = 2
sql "UPDATE users SET deletion_due_at=now()-interval '1 second' WHERE email_normalized='cp2-b@example.com'"
compose exec -T api python -m app.commands.auth purge-deleted-accounts
test "$(sql "SELECT count(*) FROM users WHERE email_normalized='cp2-b@example.com'")" = 0
test "$(sql "SELECT count(*) FROM users WHERE email_normalized='cp2-a@example.com' AND deletion_due_at>now()")" = 1
sql "UPDATE users SET deletion_due_at=NULL WHERE email_normalized='cp2-a@example.com'"

compose stop db
test "$(curl -sS --cacert "$work/caddy-ca.crt" -o /dev/null -w '%{http_code}' "$origin/api/health")" = 503
compose up -d --wait --force-recreate db
compose up -d --wait --force-recreate --no-build api caddy
check persist

python3 scripts/backup_restore.py backup "$work/backups" --production-env "$env_file" --project-name "$project"
set -- "$work"/backups/myway-*
python3 scripts/backup_restore.py restore-test "$1" --postgres-image "$(compose config --images db)"
printf 'Production Compose smoke passed. Synthetic evidence: %s\n' "$work"
