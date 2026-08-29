#!/usr/bin/env bash
# ============================================================================
# KONTA — backup real da base de dados (Pre-Beta Hardening, Prioridade 1).
#
# NÃO depende de "o volume Docker existe": produz um ficheiro de dump fora
# do container e fora do volume da base de dados, com `pg_dump` a correr
# dentro do container `db` (a imagem postgres:16 já traz pg_dump/pg_restore,
# não é preciso instalar nada extra no servidor) e o resultado é escrito no
# disco do próprio servidor (host), em BACKUP_DIR.
#
# Uso:
#   ./scripts/backup/backup.sh
#
# Variáveis de ambiente (todas têm valor por omissão razoável para dev):
#   COMPOSE_FILE   ficheiro docker-compose a usar (default: docker-compose.yml)
#   DB_SERVICE     nome do serviço da base de dados no compose (default: db)
#   POSTGRES_USER  utilizador Postgres (default: konta)
#   POSTGRES_DB    nome da base de dados (default: konta_dev)
#   BACKUP_DIR     onde ficam os ficheiros .dump (default: ./backups)
#   RETENTION_DAYS quantos dias de backups locais manter (default: 14)
#   RCLONE_REMOTE  opcional — nome de um remote rclone (ex: "b2:konta-backups")
#                  configurado previamente com `rclone config`. Se definido,
#                  cada backup é também copiado para esse remote (armazenamento
#                  fora do servidor — ver docs/architecture/BACKUP.md).
#
# Ver docs/architecture/BACKUP.md para a explicação completa (onde ficam os
# backups, frequência, retenção, como restaurar, como verificar).
# ============================================================================
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
DB_SERVICE="${DB_SERVICE:-db}"
POSTGRES_USER="${POSTGRES_USER:-konta}"
POSTGRES_DB="${POSTGRES_DB:-konta_dev}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
out_file="$BACKUP_DIR/konta_${POSTGRES_DB}_${timestamp}.dump"
tmp_file="${out_file}.part"

log() { echo "[backup] $(date -u +%H:%M:%SZ) $*"; }

log "A iniciar backup de '$POSTGRES_DB' (serviço compose: $DB_SERVICE) -> $out_file"

# --format=custom (-Fc): formato binário comprimido da própria Postgres,
# necessário para pg_restore (ver restore.sh) e para restaurar tabelas
# individuais se algum dia for preciso. `-T` no docker compose exec desliga o
# pseudo-TTY para o stdout ficar limpo (só o dump binário, sem sequências de
# terminal a corromper o ficheiro).
if ! docker compose -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" \
    pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > "$tmp_file"; then
  log "ERRO: pg_dump falhou. A remover ficheiro parcial."
  rm -f "$tmp_file"
  exit 1
fi

# Validação mínima: um dump vazio ou demasiado pequeno é sinal de que algo
# correu mal mesmo que o pg_dump não tenha devolvido código de erro (ex:
# ligado à base de dados errada, base de dados vazia por engano).
size_bytes="$(stat -c%s "$tmp_file" 2>/dev/null || stat -f%z "$tmp_file")"
if [ "$size_bytes" -lt 200 ]; then
  log "ERRO: ficheiro de backup suspeito de vazio (${size_bytes} bytes). A abortar."
  rm -f "$tmp_file"
  exit 1
fi

mv "$tmp_file" "$out_file"
log "Backup local concluído: $out_file (${size_bytes} bytes)"

if [ -n "${RCLONE_REMOTE:-}" ]; then
  if command -v rclone >/dev/null 2>&1; then
    log "A copiar para armazenamento externo: $RCLONE_REMOTE"
    if rclone copy "$out_file" "$RCLONE_REMOTE" --checksum; then
      log "Cópia externa concluída."
    else
      log "AVISO: cópia externa falhou — o backup local em $out_file continua válido."
    fi
  else
    log "AVISO: RCLONE_REMOTE definido mas 'rclone' não está instalado — a saltar cópia externa."
  fi
fi

log "A aplicar retenção: a apagar backups locais com mais de ${RETENTION_DAYS} dias em $BACKUP_DIR"
find "$BACKUP_DIR" -name 'konta_*.dump' -mtime "+${RETENTION_DAYS}" -print -delete

log "Concluído."
