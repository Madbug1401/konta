#!/usr/bin/env bash
# ============================================================================
# KONTA — restaurar um backup para a base de dados real (Prioridade 1).
#
# ATENÇÃO: isto SUBSTITUI os dados atuais da base de dados de destino
# (--clean --if-exists apaga os objetos existentes antes de os recriar a
# partir do dump). Usa isto para recuperar de um desastre, não como rotina.
# Para testar um backup sem arriscar dados reais, usa verify-backup.sh.
#
# Uso:
#   ./scripts/backup/restore.sh caminho/para/ficheiro.dump --yes
#
# A flag --yes é obrigatória (evita restaurar por engano em produção a
# correr num script/cron). Sem ela, o script explica o que faria e sai.
#
# Mesmas variáveis de ambiente que backup.sh (COMPOSE_FILE, DB_SERVICE,
# POSTGRES_USER, POSTGRES_DB).
# ============================================================================
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
DB_SERVICE="${DB_SERVICE:-db}"
POSTGRES_USER="${POSTGRES_USER:-konta}"
POSTGRES_DB="${POSTGRES_DB:-konta_dev}"

log() { echo "[restore] $(date -u +%H:%M:%SZ) $*"; }

backup_file="${1:-}"
confirm_flag="${2:-}"

if [ -z "$backup_file" ] || [ ! -f "$backup_file" ]; then
  echo "Uso: $0 caminho/para/ficheiro.dump --yes" >&2
  exit 1
fi

if [ "$confirm_flag" != "--yes" ]; then
  cat >&2 <<EOF
Isto vai APAGAR e SUBSTITUIR o conteúdo atual da base de dados '$POSTGRES_DB'
(serviço compose: $DB_SERVICE) pelo conteúdo de:
  $backup_file

Se tens a certeza, corre de novo com --yes no fim:
  $0 "$backup_file" --yes
EOF
  exit 1
fi

log "A restaurar '$backup_file' para '$POSTGRES_DB' (serviço compose: $DB_SERVICE)..."

# --clean --if-exists: remove tabelas/objetos existentes antes de recriar a
# partir do dump, para o resultado final ser exatamente o do backup (não uma
# mistura do estado atual com o do backup). --no-owner/--no-privileges evita
# falhas de restauro por diferenças de roles entre ambientes.
if docker compose -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" \
    pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    --clean --if-exists --no-owner --no-privileges < "$backup_file"; then
  log "Restauro concluído com sucesso."
else
  log "AVISO: pg_restore devolveu erros — alguns são normais (ex: 'role does not exist' ao limpar objetos que nunca existiram neste ambiente). Confirma manualmente o estado dos dados antes de considerar isto resolvido:"
  log "  docker compose -f $COMPOSE_FILE exec $DB_SERVICE psql -U $POSTGRES_USER -d $POSTGRES_DB -c 'SELECT count(*) FROM \"User\";'"
  exit 1
fi
