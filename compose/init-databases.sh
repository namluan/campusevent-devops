#!/bin/sh
# Execute une seule fois, a la creation du volume PostgreSQL :
# une base et un utilisateur par microservice.
# Le meme script est repris dans k8s/04-database/postgres-init.yaml.
set -eu

create_database() {
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -v name="$1" -v pass="$2" <<'SQL'
CREATE USER :"name" PASSWORD :'pass';
CREATE DATABASE :"name" OWNER :"name";
REVOKE CONNECT ON DATABASE :"name" FROM PUBLIC;
SQL
}

create_database events_db "$EVENTS_DB_PASSWORD"
create_database bookings_db "$BOOKINGS_DB_PASSWORD"
