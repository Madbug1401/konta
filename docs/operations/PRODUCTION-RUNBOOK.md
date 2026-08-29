# Konta — Runbook de produção (operações do dia-a-dia)

Este documento assume que o Konta já está em produção na VM Oracle Cloud,
seguindo `docs/operations/ORACLE-CLOUD.md`. Cobre o que fazer depois do
primeiro deploy: atualizar, reverter, recuperar de uma perda total da VM, e
verificar que tudo continua saudável — sem depender de nenhuma ferramenta
paga de CI/CD ou observabilidade.

---

## 1. Persistência do Postgres — o que garante que `docker compose down` não apaga dados

**CONFIRMADO por leitura do `docker-compose.prod.yml`**: o serviço `db` usa
um volume Docker nomeado (`konta_pg_data:/var/lib/postgresql/data`), não um
volume anónimo nem um bind mount temporário. Isto significa:

| Comando | Efeito nos dados do Postgres |
|---|---|
| `docker compose -f docker-compose.prod.yml restart` | Nenhum — reinicia o processo, o volume não é tocado |
| `docker compose -f docker-compose.prod.yml down` | Nenhum — remove os *containers*, não os volumes nomeados |
| `docker compose -f docker-compose.prod.yml down -v` | **APAGA os dados** — a flag `-v` remove também os volumes. **Nunca usar `-v` em produção.** |
| `docker compose -f docker-compose.prod.yml up -d --build` | Nenhum nos dados — reconstrói e recria os *containers* de `app`/`caddy`, o `db` só recria se a definição do serviço mudar (não muda ao atualizar só a app) |
| `docker compose -f docker-compose.prod.yml pull` | Nenhum — só descarrega imagens novas (`postgres:16`, `caddy:2-alpine`); a imagem da `app` não vem de um registo, é construída localmente (`build: .`) |

**Comportamento após recriação do container** (`down` seguido de `up`
sem `-v`): o Postgres arranca e encontra o mesmo diretório de dados no
volume `konta_pg_data` — os dados sobrevivem exatamente como esperado.
**Comportamento após atualização da aplicação**: como o `db` não faz parte
do que muda ao atualizar a `app` (secção 2 abaixo), nem chega a ser
recriado.

## 2. Atualizar a aplicação (deploy de uma nova versão)

**Fluxo simples, sem CI/CD** (secção 16 do briefing — CI/CD complexo fica de
fora de propósito):

```
Windows (git push) → GitHub → SSH para a VM → git pull → docker compose build → docker compose up -d
```

Na VM:

```bash
cd ~/konta
git pull origin main

# Se houver migrações novas em prisma/manual-sql/ desde o último deploy,
# aplicá-las ANTES de subir a nova versão da app (mesmo padrão da secção 9
# de ORACLE-CLOUD.md):
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U konta -d konta -f /migrations/000X_nome_da_migracao.sql

# Reconstruir só a app (o "--no-deps" evita recriar/reiniciar "db" e
# "caddy" desnecessariamente):
docker compose -f docker-compose.prod.yml --env-file .env.production \
  build app
docker compose -f docker-compose.prod.yml --env-file .env.production \
  up -d --no-deps app

# Confirmar que subiu saudável antes de considerar terminado:
docker compose -f docker-compose.prod.yml ps
curl -i https://<SITE_ADDRESS>/api/health
```

O Postgres não é tocado neste fluxo — nem reiniciado, nem recriado. O
`caddy` também não precisa de reiniciar (continua a apontar para
`app:3000`, que se mantém como nome de serviço mesmo com um container
novo).

### CI/CD — não implementado agora, opção futura documentada

Não é um requisito para a Beta (secção 16 do briefing). Se mais tarde fizer
sentido automatizar o `git pull && docker compose build && up -d` acima a
cada push: uma GitHub Action gratuita (dentro do limite generoso de minutos
grátis do GitHub para repositórios privados/públicos) a correr por SSH na
VM é a opção mais simples e sem custo adicional — mas isto fica
deliberadamente fora do âmbito desta tarefa.

## 3. Rollback

Se uma versão nova tiver um problema:

```bash
cd ~/konta
git log --oneline -5           # identificar o commit anterior estável
git checkout <hash-do-commit-anterior>
docker compose -f docker-compose.prod.yml --env-file .env.production build app
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --no-deps app
```

**Atenção a migrações**: se a versão com problema incluiu uma migração de
schema já aplicada, o rollback do código sem reverter a migração pode
deixar a app antiga incompatível com o schema novo. Para esta Beta (schema
simples, migrações aditivas até agora — ver `prisma/manual-sql/`), isto não
é esperado ser um problema comum; se acontecer, o schema em causa tem de
ser avaliado caso a caso antes do rollback do código.

Voltar ao último commit (desfazer o rollback, quando a correção real
estiver pronta):

```bash
git checkout main
git pull origin main
# repetir os passos de build/up da secção 2
```

## 4. Restauro completo após perda da VM

Este é o cenário "a VM Oracle desapareceu" (não um simples restart) — a
situação que o backup em Object Storage (secção 1 de `BACKUP.md`) existe
precisamente para cobrir. Procedimento real, não "corre o restore.sh":

1. **Provisionar uma VM nova** — repetir `ORACLE-CLOUD.md`, secções 1–8
   (nova VM, SSH, firewall, Docker, clonar o repositório, `.env.production`
   novo com **as mesmas** `POSTGRES_PASSWORD`/`AUTH_SECRET` do backup se
   quiseres preservar sessões existentes, ou novas se preferires forçar
   novo login de todos — qualquer uma é válida).
2. **Parar a aplicação** (não aplicável ainda nesta fase — a app só sobe
   depois dos dados estarem restaurados, ver passo 5).
3. **Subir só o Postgres, vazio**:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d db
   docker compose -f docker-compose.prod.yml ps   # esperar "healthy"
   ```
4. **Descarregar o backup mais recente do Object Storage e restaurar**:
   ```bash
   rclone config   # reconfigurar o remote "oracle" nesta VM nova (secção 14.2 de ORACLE-CLOUD.md)
   rclone copy oracle:konta-backups ./backups --include "konta_*.dump"
   latest="$(ls -t backups/konta_*.dump | head -1)"
   COMPOSE_FILE=docker-compose.prod.yml ./scripts/backup/restore.sh "$latest" --yes
   ```
5. **Verificar schema e dados** antes de expor a app a ninguém:
   ```bash
   docker compose -f docker-compose.prod.yml exec db \
     psql -U konta -d konta -c '\dt'          # tabelas presentes?
   docker compose -f docker-compose.prod.yml exec db \
     psql -U konta -d konta -c 'SELECT count(*) FROM "User";'
   docker compose -f docker-compose.prod.yml exec db \
     psql -U konta -d konta -c 'SELECT count(*) FROM "Transaction";'
   ```
   Compara as contagens com o que esperarias do último dia normal de uso —
   uma discrepância grande é sinal de restaurar um backup mais antigo em
   vez do mais recente, não necessariamente de corrupção.
6. **Iniciar a aplicação e o Caddy**:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build app caddy
   ```
7. **Executar o health check**:
   ```bash
   curl -i https://<SITE_ADDRESS>/api/health
   ```
8. **Validar funcionamento real** antes de anunciar a recuperação aos
   utilizadores: login com uma conta de teste (ou uma conta real, com
   consentimento), confirmar que o saldo/histórico batem certo com o que
   era esperado no momento do backup usado.

**Se o IP público mudar** (uma VM nova quase sempre tem um IP diferente): o
`SITE_ADDRESS` também muda (novo hostname sslip.io, ou reapontar o domínio
real para o IP novo) — ver `ORACLE-CLOUD.md`, secção "HTTPS".

## 5. Verificar que os backups continuam a acontecer

Rotina semanal recomendada (sem alerta automático — ver limitação aceite em
`BACKUP.md`):

```bash
tail -20 /var/log/konta-backup.log                  # opção cron
systemctl status konta-backup.service                # opção systemd timer
journalctl -u konta-backup.service --since "7 days ago"
rclone ls oracle:konta-backups | tail -5             # confirma uploads recentes
ls -la backups/ | tail -5                            # confirma backups locais recentes
```

## 6. Monitorização básica (sem Sentry/Datadog)

Suficiente para uma Beta de 10–30 utilizadores, por decisão explícita
(ver `DECISIONS.md`, "Logging mínimo"):

```bash
# Logs da aplicação (inclui tudo o que src/lib/logger.ts regista):
docker compose -f docker-compose.prod.yml logs -f --tail=100 app

# Logs do reverse proxy (pedidos HTTP, erros de certificado):
docker compose -f docker-compose.prod.yml logs -f --tail=100 caddy

# Estado de saúde de cada container:
docker compose -f docker-compose.prod.yml ps

# Recursos da VM (CPU/RAM/rede por container, em tempo real):
docker stats

# Espaço em disco (o boot volume de 50 GB é finito — verificar
# periodicamente, sobretudo o crescimento do volume do Postgres):
df -h
docker system df

# Health check da aplicação (o mesmo endpoint que o Caddy/qualquer
# monitor externo gratuito, tipo UptimeRobot, poderia consultar):
curl -i https://<SITE_ADDRESS>/api/health
```

**Opcional, gratuito, fora do âmbito desta tarefa**: um serviço externo
gratuito de "uptime monitoring" (ex. UptimeRobot, tier grátis) a fazer
`GET /api/health` a cada alguns minutos e avisar por email se parar de
responder — não implementado agora, mencionado aqui só como próximo passo
natural e sem custo, não como requisito da Beta.

## 7. Limpeza de espaço em disco (Docker acumula imagens antigas)

Depois de vários deploys, imagens Docker antigas ocupam espaço no boot
volume de 50 GB:

```bash
docker image prune -af --filter "until=168h"   # remove imagens não usadas há mais de 7 dias
docker system df                                # confirmar espaço recuperado
```

Não usar `docker system prune -a` sem o filtro de tempo em produção — pode
remover imagens ainda referenciadas que só não estão a correr num container
neste momento exato.
