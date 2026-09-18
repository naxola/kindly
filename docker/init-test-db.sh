#!/bin/sh
# Runs once, automatically, the first time the postgres container's data
# volume is created (see docker-compose.yml, mounted into
# /docker-entrypoint-initdb.d/). Creates the separate database used by
# integration tests (tests/integration/**) so `npm test` never touches the
# dev database (`kindly`).
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE kindly_test;
EOSQL
