#!/usr/bin/env bash
# ============================================================================
# KONTA — verificar que um backup É REALMENTE restaurável (Prioridade 1,
# ponto 5: "Como verificar que o backup realmente funciona").
#
# Um ficheiro .dump existir no disco não prova nada — pode estar corrompido,
# incompleto, ou de uma base de dados errada. Este script prova recuperação
# real: restaura o backup para uma base de dados TEMPORÁRIA e descartável no
# mesmo Postgres, corre verificações de sanidade, e no fim apaga sempre essa
# base de dados temporária (nunca toca em '$POSTGRES_DB' original).
#
# Uso:
#   ./scripts/backup/verify-backup.sh caminho/para/ficheiro.dump
#
# Recomendação (ver docs/architecture/BACKUP.md): corre isto automaticamente
# a seguir a cada backup.sh (já não é preciso confiança cega de que o dump
# "deve estar bom") e também manualmente depois de qualquer mudança grande à
# infraestrutura de backup.
#
# Mesmas variáveis de ambiente que backup.sh (COMPOSE_FILE, DB_SERVICE,
# POSTGRES_USER). Não usa POSTGRES_DB do ambiente — cria sempre um nome novo.
# ============================================================================
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
DB_SERVICE="${DB_SERVICE:-db}"
POSTGRES_USER="${POSTGRES_USER:-konta}"

log() { echo "[verify-backup] $(date -u +%H:%M:%SZ) $*"; }

backup_file="${1:-}"
if [ -z "$backup_file" ] || [ ! -f "$backup_file" ]; then
  echo "Uso: $0 caminho/para/ficheiro.dump" >&2
  exit 1
fi

verify_db="konta_verify_$(date -u +%Y%m%d%H%M%S)"

cleanup() {
  log "A limpar base de dados temporária '$verify_db'..."
  docker compose -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" \
    psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$verify_db\";" >/dev/null 2>&1 || true
}
trap cleanup EXIT

log "A criar base de dados temporária '$verify_db' para o teste de restauro..."
docker compose -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" \
  psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE \"$verify_db\";"

log "A restaurar '$backup_file' para '$verify_db' (isto NÃO toca na base de dados real)..."
if ! docker compose -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" \
    pg_restore -U "$POSTGRES_USER" -d "$verify_db" --no-owner --no-privileges < "$backup_file"; then
  log "ERRO: pg_restore falhou a restaurar o backup para a base de dados de verificação."
  exit 1
fi

log "Restauro concluído. A correr verificações de sanidade..."

# Verificação 1: as tabelas principais existem depois do restauro.
missing_tables=""
for table in User Account Transaction Category; do
  exists="$(docker compose -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" \
    psql -U "$POSTGRES_USER" -d "$verify_db" -tAc \
    "SELECT to_regclass('\"$table\"') IS NOT NULL;")"
  if [ "$(echo "$exists" | tr -d '[:space:]')" != "t" ]; then
    missing_tables="$missing_tables $table"
  fi
done
if [ -n "$missing_tables" ]; then
  log "ERRO: tabelas em falta depois do restauro:$missing_tables"
  exit 1
fi
log "OK: tabelas principais (User, Account, Transaction, Category) presentes."

# Verificação 2: consegue mesmo ler dados através delas (não só que a tabela
# existe vazia por causa de uma restauração parcial silenciosa).
user_count="$(docker compose -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" \
  psql -U "$POSTGRES_USER" -d "$verify_db" -tAc 'SELECT count(*) FROM "User";' | tr -d '[:space:]')"
tx_count="$(docker compose -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" \
  psql -U "$POSTGRES_USER" -d "$verify_db" -tAc 'SELECT count(*) FROM "Transaction";' | tr -d '[:space:]')"
log "OK: consulta bem-sucedida — $user_count utilizador(es), $tx_count transação/transações no backup restaurado."

log "SUCESSO: o backup '$backup_file' é restaurável e contém dados legíveis."
