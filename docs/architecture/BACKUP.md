# Konta — Backup e recuperação (Pre-Beta Hardening, Prioridade 1)

O `GO_TO_BETA_AUDIT.md` (achado 5.7) confirmou que não existia nenhuma cópia
de segurança dos dados financeiros de ninguém — só o volume Docker, que não
é backup nenhum (sobrevive a um `docker compose down`, mas não a um disco
corrompido, um `docker volume rm` por engano, ou o servidor inteiro
desaparecer). Esta secção responde diretamente às cinco perguntas exigidas
antes de considerar isto concluído.

## 1. Onde ficam os backups

Em dois sítios, de propósito:

- **No disco do próprio servidor**, fora do volume Docker do Postgres — em
  `BACKUP_DIR` (por omissão `./backups` a partir da raiz do projeto no
  servidor), um ficheiro `.dump` por execução, produzido por
  `scripts/backup/backup.sh`. Isto já sobrevive a qualquer problema dentro do
  container/volume do Postgres.
- **Fora do servidor** (recomendado antes de abrir a Beta a utilizadores
  reais, e concretizado na preparação de deploy Oracle Cloud): **Oracle
  Object Storage**, através de um `RCLONE_REMOTE` configurado com o backend
  nativo `oracleobjectstorage` do `rclone` (suporte oficial, confirmado por
  pesquisa nesta tarefa — `rclone.org/oracleobjectstorage`). O mesmo script
  `backup.sh` copia cada backup para lá automaticamente, sem nenhuma
  alteração ao script em si (já suportava qualquer destino `rclone` desde a
  Prioridade 1). Isto é o que protege contra o cenário "o servidor inteiro
  desapareceu" (falha de hardware da VM, conta bloqueada, etc.) — um backup
  que só existe no mesmo servidor que se quer proteger não é suficiente para
  esse cenário.

**Decisão explícita — porque Oracle Object Storage e não Backblaze B2/S3**:
mantém tudo dentro da mesma conta gratuita já necessária para a VM (secção
1 de `DEPLOYMENT.md`), sem abrir uma segunda conta/fatura só para
armazenamento — e o tier Always Free do Object Storage (ver "Limites"
abaixo) chega perfeitamente para o volume de backups desta Beta. O
`rclone` continua a ser a ferramenta usada (já testada nesta tarefa contra
o mecanismo genérico) — só o destino concreto passou de "a decidir" para
Oracle Object Storage; se um dia a Oracle deixar de fazer sentido, basta
apontar `RCLONE_REMOTE` para outro backend suportado por `rclone`
(Backblaze B2, S3, etc.) sem tocar em `backup.sh`.

### Limites do Oracle Object Storage Always Free (confirmado, não assumido)

Consultado nesta tarefa diretamente na documentação oficial da Oracle
(`docs.oracle.com`, página "Always Free Resources"):

- **20 GB combinados** entre os tiers Standard, Infrequent Access e Archive.
- **50.000 pedidos de API por mês** (upload/download/listagem contam para
  isto).

**Cálculo de capacidade para 10–30 utilizadores** (estimativa razoável, não
um benchmark artificial): um `pg_dump -Fc` (formato comprimido) do schema
do Konta com dados de 10–30 utilizadores reais, meses de transações
incluídas, fica tipicamente na ordem de poucos MB a algumas dezenas de MB —
muito longe de gigabytes, porque não há anexos/imagens na base de dados
(dinheiro é sempre `BIGINT`, texto é curto). Com um backup diário de,
digamos, 20 MB e retenção de 14 dias só localmente (secção 3), o volume
diário enviado para o Object Storage é o que importa para os 50.000
pedidos/mês: 1 backup/dia × ~1–3 pedidos de API por upload (dependendo de
como o `rclone` faz chunking) fica muitíssimo abaixo do limite mensal. Para
os 20 GB de armazenamento não se esgotarem com o tempo, aplica-se uma
regra de ciclo de vida (lifecycle rule) no próprio bucket do Object Storage
para apagar objetos com mais de, por exemplo, 60–90 dias — configurável no
console da Oracle, documentado em `ORACLE-CLOUD.md`, não gerido pelo
`backup.sh` (ver nota na secção "Retenção" abaixo). **Isto não foi medido
com dados reais de produção** — é uma estimativa a rever depois de algumas
semanas reais de Beta com o comando `rclone size <remote>`.

## 2. Frequência

**Diária** (mínimo exigido pela Prioridade 1). Duas formas equivalentes de
agendar na VM Oracle (Ubuntu) — escolher uma, não as duas:

**Opção A — `cron`** (mais simples, igual ao que já estava documentado):

```cron
# crontab -e do utilizador que corre o Docker
0 3 * * * cd /caminho/para/konta && \
  POSTGRES_DB=konta COMPOSE_FILE=docker-compose.prod.yml \
  ./scripts/backup/backup.sh >> /var/log/konta-backup.log 2>&1
```

**Opção B — systemd timer** (mais robusto no Ubuntu moderno: regista o
resultado no `journald`, tem `OnFailure=` nativo para reagir a uma falha
sem depender de um MTA local para enviar email de cron): ver
`docs/operations/ORACLE-CLOUD.md`, secção "Backup automático", para as
duas unidades (`konta-backup.service` + `konta-backup.timer`) prontas a
copiar para `/etc/systemd/system/`.

Em ambos os casos, 03:00 é só uma sugestão (horário de baixo uso); pode ser
aumentado para várias vezes ao dia sem nenhuma mudança ao script.

**O backup nunca falha em silêncio** — isto já estava garantido antes desta
tarefa e continua válido: `backup.sh` corre com `set -euo pipefail` (qualquer
erro no meio do script pára a execução imediatamente, não continua "como se
nada fosse"), sai com código de saída diferente de zero sempre que o
`pg_dump` falha ou o ficheiro produzido é suspeito de vazio (menos de 200
bytes), e cada passo escreve uma linha com timestamp UTC no log. Com a
Opção A, um `pg_dump` que falhe faz `backup.sh` sair com erro — visível em
`/var/log/konta-backup.log`, mas **sem alerta ativo** (não há Sentry/email
configurado, por decisão consciente de manter isto simples para a Beta —
ver `DECISIONS.md`, "Logging mínimo"). Com a Opção B, um exit code
diferente de zero fica automaticamente marcado como `failed` em `systemctl
status konta-backup.service` e registado no `journalctl`, e pode disparar
um `OnFailure=` que corre `logger` ou um script simples — sem introduzir
nenhum serviço de observabilidade pago. **Limitação aceite para $0**: sem
um canal de alerta ativo (push/email/SMS), alguém tem de verificar o log
periodicamente (recomendação: uma vez por semana, e sempre a seguir a
qualquer mudança na infraestrutura de backup) — isto é uma escolha
consciente para não introduzir custo/complexidade nova nesta fase, não um
esquecimento.

## 3. Retenção

**14 dias** de backups locais por omissão (`RETENTION_DAYS=14`, configurável
por variável de ambiente sem editar o script). `backup.sh` apaga
automaticamente, no fim de cada execução, qualquer ficheiro `konta_*.dump`
mais antigo do que isso em `BACKUP_DIR`. Se um `RCLONE_REMOTE` estiver
configurado (Oracle Object Storage, ver secção 1), a retenção nesse remote
fica a cargo da política do próprio destino — no caso da Oracle, uma
**lifecycle rule do próprio bucket de Object Storage** (configurável no
console, documentado em `ORACLE-CLOUD.md`) — não é gerida por este script,
para evitar apagar por engano a única cópia fora do servidor.

**Porque 14 dias**: cobre confortavelmente o caso mais comum ("reparei ontem
que uma coisa está errada desde a semana passada") sem acumular
indefinidamente disco no servidor. Pode ser alargado facilmente (é só mudar
`RETENTION_DAYS`) se o histórico de 14 dias se revelar insuficiente na
prática.

## 4. Como restaurar

```bash
./scripts/backup/restore.sh backups/konta_konta_20260829T030000Z.dump --yes
```

Isto:
1. Corre `pg_restore --clean --if-exists` **dentro do container `db`** já a
   correr (a imagem `postgres:16` já traz `pg_restore`, não precisa de nada
   instalado no servidor além do Docker) — apaga os objetos existentes e
   recria tudo exatamente como estava no momento do backup.
2. Exige a flag `--yes` explícita — sem ela, o script explica o que faria e
   sai sem tocar em nada, para nunca restaurar por acidente dentro de um
   script/cron automatizado.

Para restaurar contra um `docker-compose.yml` diferente do de produção (ex:
testar localmente), basta `COMPOSE_FILE=docker-compose.yml` antes do
comando.

## 5. Como verificar que o backup realmente funciona

Isto é o ponto mais importante — um ficheiro `.dump` existir no disco não
prova que é restaurável. `scripts/backup/verify-backup.sh` prova
recuperação real, não só existência do ficheiro:

```bash
./scripts/backup/verify-backup.sh backups/konta_konta_20260829T030000Z.dump
```

O script:
1. Cria uma base de dados **temporária e descartável** no mesmo Postgres
   (`konta_verify_<timestamp>`) — nunca toca na base de dados real.
2. Restaura o backup para essa base de dados temporária.
3. Confirma que as tabelas principais (`User`, `Account`, `Transaction`,
   `Category`) existem e que há dados legíveis nelas (não só tabelas vazias
   por uma restauração parcial silenciosa).
4. Apaga sempre a base de dados temporária no final (mesmo se algo falhar a
   meio — usa `trap ... EXIT`).

**Testado de facto nesta tarefa** (não só escrito e assumido que funciona):
correu-se o ciclo completo — `pg_dump` de uma base de dados real com o
schema do Konta (`prisma/manual-sql/0001_init.sql` aplicado) e dados reais
(utilizadores/transações), `pg_restore` para uma base de dados de
verificação separada, confirmação das 4 tabelas e das contagens de linhas, e
um segundo teste confirmando que `restore.sh` com `--clean --if-exists`
substitui corretamente dados existentes pelos do backup (uma linha "lixo"
inserida antes do restauro deixou de existir depois, substituída pelos dados
do dump). Não foi possível correr isto através do próprio
`docker compose exec` neste sandbox (o registo `docker.io` está bloqueado
aqui — ver `DEPLOYMENT.md`, secção 2), por isso o teste correu com os mesmos
comandos `pg_dump`/`pg_restore`/`psql` diretamente contra um Postgres 16
real — a única diferença do que os scripts fazem é "dentro do container" vs.
"no host", o que não muda o comportamento do `pg_dump`/`pg_restore` em si.

**Recomendação**: correr `verify-backup.sh` automaticamente a seguir a cada
`backup.sh` no mesmo cron (fica registado no mesmo log e falha de forma
visível se algum backup deixar de ser restaurável), e manualmente sempre que
a infraestrutura de backup mudar:

```cron
0 3 * * * cd /caminho/para/konta && COMPOSE_FILE=docker-compose.prod.yml ./scripts/backup/backup.sh >> /var/log/konta-backup.log 2>&1 && \
  latest="$(ls -t backups/konta_*.dump | head -1)" && \
  COMPOSE_FILE=docker-compose.prod.yml ./scripts/backup/verify-backup.sh "$latest" >> /var/log/konta-backup.log 2>&1
```

## O que fica por fazer antes do primeiro backup real em produção

**NÃO TESTADO — DEPENDE DA ORACLE CLOUD** (nenhum destes passos pode ser
feito dentro deste ambiente de desenvolvimento; ficam para a VM real, ver
`ORACLE-CLOUD.md`):

- Criar um bucket de Object Storage na Oracle Cloud e gerar credenciais
  (Customer Secret Key, compatível com a API S3, ou as chaves nativas OCI)
  para o `rclone` usar — passo a passo em `ORACLE-CLOUD.md`.
- Configurar o remote no servidor com `rclone config` (tipo
  `oracleobjectstorage`) e definir `RCLONE_REMOTE=oracle:konta-backups` (ou
  o nome escolhido) no ambiente do cron/systemd timer — sem isto, a
  proteção contra "o servidor inteiro desapareceu" não está ativa, só a
  proteção contra "o volume Docker corrompeu".
- Configurar uma lifecycle rule no bucket (ex: apagar objetos com mais de
  60–90 dias) para os 20 GB do Always Free não se esgotarem com o tempo —
  ver cálculo de capacidade na secção 1.
- Confirmar que o `cron`/systemd timer do servidor tem `docker`/`docker
  compose`/`rclone` no `PATH` (comum ao correr como utilizador não
  interativo) — testar o comando manualmente uma vez antes de confiar no
  agendamento.
- Correr um ciclo real de backup → upload → `verify-backup.sh` na própria
  VM Oracle pelo menos uma vez antes do primeiro utilizador da Beta entrar
  — fecha a única diferença entre "testado com comandos equivalentes neste
  sandbox" (secção acima) e "testado no sítio exato onde vai correr".
