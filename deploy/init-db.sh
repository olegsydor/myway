#!/bin/sh
set -eu

# The temporary bootstrap server listens only on the Unix socket.
psql -X --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v ON_ERROR_STOP=1 <<'SQL'
\getenv migration_password POSTGRES_MIGRATION_PASSWORD
\getenv runtime_password POSTGRES_RUNTIME_PASSWORD
BEGIN;
CREATE ROLE myway_migrate LOGIN PASSWORD :'migration_password';
CREATE ROLE myway_runtime LOGIN PASSWORD :'runtime_password';
REVOKE ALL ON DATABASE myway FROM PUBLIC;
GRANT CONNECT ON DATABASE myway TO myway_migrate, myway_runtime;
ALTER SCHEMA public OWNER TO myway_migrate;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO myway_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE myway_migrate IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO myway_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE myway_migrate IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO myway_runtime;
COMMIT;
SQL
