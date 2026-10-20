#!/usr/bin/env bash
# Cria um banco vazio, aplica tudo duas vezes (reaplicar tem que ser seguro) e
# roda teste_sistema.sql. Precisa de um Postgres 16 acessivel:
#
#     PGHOST=... PGPORT=... PGUSER=postgres supabase/testar_sistema.sh
set -euo pipefail
cd "$(dirname "$0")"
BANCO=moonshot_teste_$$
psql -q -v ON_ERROR_STOP=1 -d postgres -c "create database $BANCO" >/dev/null
trap 'psql -q -d postgres -c "drop database if exists $BANCO" >/dev/null' EXIT
for vez in 1 2; do
  for f in schema.sql sistema.sql sistema_funis.sql sistema_importar.sql; do
    psql -q -v ON_ERROR_STOP=1 -d "$BANCO" -f "$f" 2>&1 | { grep -v NOTICE || true; }
  done
done
psql -q -v ON_ERROR_STOP=1 -d "$BANCO" -o /dev/null -f teste_sistema.sql 2>&1 \
  | sed -n 's/.*NOTICE:  \(ok .*\)/\1/p; /FALHOU\|ERROR/p; /TODOS OS TESTES/p'
