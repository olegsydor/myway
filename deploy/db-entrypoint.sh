#!/bin/sh
set -eu

for password in "$POSTGRES_PASSWORD" "$POSTGRES_MIGRATION_PASSWORD" "$POSTGRES_RUNTIME_PASSWORD"; do
    case "$password" in
        ""|[Rr][Ee][Pp][Ll][Aa][Cc][Ee]*|[Cc][Hh][Aa][Nn][Gg][Ee]*|[Dd][Ee][Vv][Ee][Ll][Oo][Pp][Mm][Ee][Nn][Tt]*)
            echo "Set private PostgreSQL credentials before starting MyWay." >&2
            exit 1 ;;
    esac
    if [ -z "$(printf '%s' "$password" | tr -d '[:space:]')" ]; then
        echo "Set private PostgreSQL credentials before starting MyWay." >&2
        exit 1
    fi
done
unset password
if [ "$POSTGRES_PASSWORD" = "$POSTGRES_MIGRATION_PASSWORD" ] ||
    [ "$POSTGRES_PASSWORD" = "$POSTGRES_RUNTIME_PASSWORD" ] ||
    [ "$POSTGRES_MIGRATION_PASSWORD" = "$POSTGRES_RUNTIME_PASSWORD" ]; then
    echo "Use distinct credentials for the three PostgreSQL roles." >&2
    exit 1
fi
exec docker-entrypoint.sh postgres "$@"
