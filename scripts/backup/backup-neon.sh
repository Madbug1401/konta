#!/usr/bin/env bash
# ============================================================================
# KONTA — backup manual contra o Neon (deploy ZERO-COST, ver
# docs/ZERO_COST_DEPLOYMENT_AUDIT.md e docs/operations/RENDER-NEON.md).
#
# Diferente de scripts/backup/backup.sh (esse pressupõe um Postgres nosso a
# correr em Docker, acedido via `docker compose exec db pg_dump` — não se
# aplica ao Neon, que é um Postgres gerido e remoto, sem container nosso
# para lhe aceder). Este script corre `pg_dump` DIRETAMENTE contra a
# connection string do Neon — não precisa de Docker nenhum, só do cliente
# `pg_dump` instalado na máquina onde corre (Windows com o instalador do
# PostgreSQL, ou este ambiente de desenvolvimento, ou qualquer máquina com
# `postgresql-client`).
#
# [DECISÃO — ver DECISIONS.md, "Backups no deploy ZERO-COST"] Nesta fase o
# backup é MANUAL, não automático — corrido periodicamente por quem gere o
# Konta, com o ficheiro `.dump` a ficar no computador do proprietário (nunca
# num repositório Git nem em nenhum serviço público). Isto é uma limitação
# aceite explicitamente, não escondida — o Neon nunca apaga os teus dados
# por inatividade (ver DECISIONS.md), mas isso não é o mesmo que um backup:
# protege contra "a conta Neon foi comprometida/apagada por engano" ou
# "preciso de recuperar um estado de há uma semana", nenhuma das quais o
# Neon em si resolve sozinho.
#
# Uso:
#   DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" \
#     ./scripts/backup/backup-neon.sh
#
# Variáveis de ambiente:
#   DATABASE_URL   connection string completa do Neon (obrigatória — sem
#                  valor por omissão de propósito, para nunca fazer backup
#                  ao ambiente errado "por acidente" com um default).
#   BACKUP_DIR     onde fica o ficheiro .dump (default: ./backups)
#   RETENTION_DAYS quantos dias de backups locais manter (default: 14,
#                  igual ao script original)
#
# Depois de correr, o ficheiro fica em BACKUP_DIR — mover manualmente para
# um local seguro no teu computador (ou pedir para eu o enviar via
# SendUserFile, se tiver corrido esta tarefa a partir daqui).
# ============================================================================
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[backup-neon] ERRO: define DATABASE_URL (connection string do Neon) antes de correr este script." >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

log() { echo "[backup-neon] $(date -u +%H:%M:%SZ) $*"; }

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "[backup-neon] ERRO: 'pg_dump' não está instalado nesta máquina." >&2
  echo "  Windows: instalar o 'PostgreSQL' da postgresql.org (inclui pg_dump.exe) ou usar WSL." >&2
  exit 1
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
out_file="$BACKUP_DIR/konta_neon_${timestamp}.dump"
tmp_file="${out_file}.part"

log "A iniciar backup do Neon -> $out_file"

# --format=custom (-Fc): mesmo formato do script original, compatível com
# `pg_restore`/`scripts/backup/verify-backup.sh` adaptando só a forma de
# ligar (sem "docker compose exec", direto por rede com SSL).
if ! pg_dump "$DATABASE_URL" -Fc > "$tmp_file"; then
  log "ERRO: pg_dump falhou. A remover ficheiro parcial."
  rm -f "$tmp_file"
  exit 1
fi

size_bytes="$(stat -c%s "$tmp_file" 2>/dev/null || stat -f%z "$tmp_file")"
if [ "$size_bytes" -lt 200 ]; then
  log "ERRO: ficheiro de backup suspeito de vazio (${size_bytes} bytes). A abortar."
  rm -f "$tmp_file"
  exit 1
fi

mv "$tmp_file" "$out_file"
log "Backup concluído: $out_file (${size_bytes} bytes)"
log "LEMBRETE: este ficheiro contém dados financeiros reais — nunca o commitar, nunca o enviar para um sítio público. Guarda-o só no teu computador (ex: fora de qualquer pasta sincronizada com o Git)."

log "A aplicar retenção: a apagar backups locais com mais de ${RETENTION_DAYS} dias em $BACKUP_DIR"
find "$BACKUP_DIR" -name 'konta_neon_*.dump' -mtime "+${RETENTION_DAYS}" -print -delete

log "Concluído. Este backup é MANUAL — não há nenhum agendamento automático nesta fase (ver docs/operations/RENDER-NEON.md)."
