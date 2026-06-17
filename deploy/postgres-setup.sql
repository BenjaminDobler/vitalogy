-- Create the vitalogy database + a dedicated role on the existing
-- Postgres instance. Run once as the postgres superuser:
--
--   sudo -u postgres psql -f /tmp/postgres-setup.sql
--
-- After this, the DATABASE_URL in /opt/vitalogy/.env is:
--   postgresql://vitalogy:<PASSWORD>@localhost:5432/vitalogy?schema=public
--
-- IMPORTANT: replace 'CHANGE_ME_BEFORE_RUNNING' below with a real
-- password — same string goes in the .env DATABASE_URL.

CREATE ROLE vitalogy WITH LOGIN PASSWORD 'CHANGE_ME_BEFORE_RUNNING';

CREATE DATABASE vitalogy OWNER vitalogy;

-- Lock the role down: it owns its own database and nothing else.
GRANT CONNECT ON DATABASE vitalogy TO vitalogy;
