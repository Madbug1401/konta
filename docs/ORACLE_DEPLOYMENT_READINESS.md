# KONTA — PREPARAÇÃO PARA DEPLOY NA ORACLE CLOUD ($0)

**Data**: 29/08/2026
**Ponto de partida**: `docs/KONTA_BETA_GATE.md` (hardening de código concluído,
infraestrutura real por fazer). Esta tarefa prepara especificamente essa
infraestrutura para a Oracle Cloud Always Free, sem alterar a aplicação.
**Convenção usada em todo este documento**: cada afirmação está marcada
como **CONFIRMADO** (verificado por inspeção de ficheiros reais ou por
pesquisa em fontes oficiais), **TESTADO LOCALMENTE** (executado de facto
neste ambiente de desenvolvimento), **DOCUMENTADO** (procedimento escrito e
correto, sem execução possível aqui), ou **NÃO TESTADO — DEPENDE DA ORACLE
CLOUD** (só confirmável na VM real). Nunca "funciona" sem uma destas
etiquetas.

---

## 1. Deployment architecture

```
Internet
   │
   ▼
Oracle Cloud (Always Free)
   │
   ▼
Ubuntu 24.04 VM  (Ampere A1, ARM64 — CONFIRMADO disponível no Always Free)
   │
   ▼
Docker / Docker Compose  (docker-compose.prod.yml)
   │
   ├── caddy   (reverse proxy — único serviço exposto a 80/443, HTTPS automático)
   │     │
   │     ▼
   ├── app     (Next.js standalone — sem porta publicada, só rede interna)
   │     │
   │     ▼
   └── db      (Postgres 16 — sem porta publicada, só rede interna)
         │
         ▼
   scripts/backup/backup.sh  (cron ou systemd timer, diário)
         │
         ▼
   Oracle Object Storage  (bucket "konta-backups", via rclone)
```

Nenhuma peça desta arquitetura é serverless nem muda o modelo da aplicação
— é exatamente a arquitetura já decidida em `docs/architecture/DEPLOYMENT.md`
("um único VPS + Docker Compose"), só concretizada para um fornecedor
específico ($0) com um reverse proxy adicionado à frente (necessário para
HTTPS, não uma mudança de arquitetura da app).

## 2. Oracle Cloud requirements

| Recurso | Valor a usar | Estado |
|---|---|---|
| Shape da VM | `VM.Standard.A1.Flex` (Ampere, ARM64) | CONFIRMADO no Always Free |
| OCPU | 2 | CONFIRMADO — limite atual do Always Free (reduzido de 4 em 15/06/2026, ver `DECISIONS.md`) |
| RAM | 12 GB | CONFIRMADO — idem |
| Sistema operativo | Ubuntu 24.04 (imagem oficial Canonical) | CONFIRMADO suportado para Ampere A1 |
| Boot volume | 50 GB (por omissão, dentro dos 200 GB Always Free) | DOCUMENTADO |
| Rede | Security List/NSG com 22/80/443 abertas | DOCUMENTADO — ver secção 9 |
| Object Storage | 1 bucket, dentro dos 20 GB Always Free | DOCUMENTADO |

Ver `docs/operations/ORACLE-CLOUD.md` para o procedimento completo de
criação e `docs/operations/ORACLE-CLOUD.md`, secção "Capacidade", para a
justificação de que isto chega para 10–30 (e provavelmente 100)
utilizadores.

## 3. Docker readiness

**Pronto, sem alterações à aplicação**:
- `Dockerfile` (multi-stage, `output: "standalone"`, utilizador não-root) —
  já existia do hardening anterior, revisto nesta tarefa, nenhuma alteração
  necessária.
- `docker-compose.prod.yml` — **alterado nesta tarefa**: adicionado o
  serviço `caddy` (reverse proxy/HTTPS), removida a publicação direta da
  porta 3000 do serviço `app` (agora só acessível internamente pelo Caddy).
  `db` continua sem porta publicada, como antes.
- `.dockerignore`, `.env.production.example` (com a variável nova
  `SITE_ADDRESS`) — revistos/atualizados.
- `Caddyfile` — novo, reverse proxy com HTTPS automático.
- Volumes persistentes corretos: `konta_pg_data` (dados do Postgres),
  `caddy_data`/`caddy_config` (certificados TLS, novos) — todos volumes
  Docker nomeados, sobrevivem a `docker compose down` (sem `-v`).
- Restart policy `unless-stopped` em todos os serviços — reiniciam
  automaticamente após falha ou reboot da VM.
- Health check já existente (`/api/health`) ligado ao serviço `app`.
- Migrações continuam a correr via SQL manual montado read-only no
  container `db` (mecânica inalterada).
- Logs acessíveis via `docker compose logs` (app e caddy) — sem alteração.
- Atualização sem destruir o Postgres — **TESTADO LOCALMENTE por análise
  direta do compose** (`db` não faz parte do que muda ao atualizar só a
  `app`) e documentado passo a passo em `docs/operations/PRODUCTION-RUNBOOK.md`.

**TESTADO LOCALMENTE**: sintaxe e resolução de variáveis do
`docker-compose.prod.yml` validada de facto com `docker compose config`
(a app não publica mais a porta 3000; só o `caddy` publica 80/443 —
confirmado no output real do comando).

**NÃO TESTADO — DEPENDE DA ORACLE CLOUD**: o `docker build`/`docker compose
up --build` completo. Tentou-se correr isto de propósito nesta tarefa
(o daemon Docker foi arrancado só para este teste) — todos os registos de
imagens (`docker.io`, `gcr.io`, `ghcr.io`, `quay.io`, `public.ecr.aws`,
`registry.k8s.io`, `mcr.microsoft.com`) estão bloqueados pela política de
rede deste sandbox, confirmado com pedidos reais que devolveram `403
Forbidden`. Ver secção 4 para a análise de compatibilidade feita sem essa
execução.

## 4. ARM64 compatibility

A VM Always Free escolhida é ARM64 — analisado a sério, não assumido.

**CONFIRMADO por inspeção do `package-lock.json` real deste repositório**:
`@next/swc-linux-arm64-musl`, `@tailwindcss/oxide-linux-arm64-musl`,
`lightningcss-linux-arm64-musl`, `@img/sharp-linuxmusl-arm64` — todas as
dependências com binários nativos usadas no build publicam variante
ARM64/musl (Alpine = musl). `prisma`/`@prisma/client` (não usados no
runtime) não têm nenhum `postinstall` de rede — confirmado lendo o próprio
script.

**CONFIRMADO por pesquisa em fontes oficiais**: `node:22-alpine`,
`postgres:16` e `caddy:2-alpine` publicam manifestos multi-arquitetura
`arm64v8` (Docker Hub, páginas oficiais de cada imagem).

**NÃO TESTADO — DEPENDE DA ORACLE CLOUD**: nenhum build ARM64 real foi
executado (bloqueio de rede total neste sandbox, ver secção 3). A primeira
confirmação por execução real só pode acontecer no primeiro `docker compose
up --build` na VM Oracle — primeiro passo prático a fazer lá, documentado
em `docs/operations/ORACLE-CLOUD.md`, secção 10.

**Conclusão**: nenhuma incompatibilidade foi encontrada; nenhuma alteração
ao `Dockerfile` foi necessária.

## 5. PostgreSQL persistence

**CONFIRMADO por leitura do compose**: volume nomeado
`konta_pg_data:/var/lib/postgresql/data`, não anónimo nem bind mount
temporário.

- `docker compose down` (sem `-v`) → dados preservados.
- `docker compose down -v` → **apaga os dados** (documentado como comando a
  nunca usar em produção).
- `docker compose restart` → sem efeito nos dados.
- Recriação do container `app`/`caddy` (atualização normal) → `db` nem
  chega a ser recriado, dados intocados.
- `docker compose pull` → só afeta `postgres:16`/`caddy:2-alpine` (imagens
  de registo); a imagem `app` é construída localmente (`build: .`), não há
  "pull" para ela.

Procedimento completo de `up`/`restart`/`down`/`pull`/atualização
documentado em `docs/operations/PRODUCTION-RUNBOOK.md`, secções 1–2.

## 6. Backup

Sem alterações aos scripts (`backup.sh`/`restore.sh`/`verify-backup.sh`,
já **TESTADOS** contra Postgres real numa tarefa anterior) — só o destino
externo passou de "a decidir" para concreto:

- **Destino externo**: Oracle Object Storage via `rclone` (backend nativo
  `oracleobjectstorage`, **CONFIRMADO** por pesquisa em `rclone.org`).
- **Limites Always Free CONFIRMADOS** (documentação oficial Oracle): 20 GB
  combinados, 50.000 pedidos de API/mês.
- **Cálculo de capacidade** (estimativa razoável, não medida com dados
  reais): backups da ordem de dezenas de MB/dia para 10–30 utilizadores,
  muitíssimo abaixo dos limites — ver `docs/architecture/BACKUP.md`.
- **Agendamento**: cron (mais simples) ou systemd timer (mais robusto,
  falhas visíveis em `systemctl status`/`journalctl` sem depender de MTA
  local) — ambos documentados, com falhas sempre explícitas (`set -euo
  pipefail`, exit code diferente de zero, nunca silencioso).
- **Retenção**: 14 dias localmente (já existia); lifecycle rule no bucket
  Oracle para o armazenamento externo (documentado, configurável no
  Console).

**NÃO TESTADO — DEPENDE DA ORACLE CLOUD**: o ciclo real backup → upload →
Object Storage → `verify-backup.sh` só pode ser confirmado na VM real (o
`rclone` para Oracle Object Storage não pode ser testado sem uma conta/
bucket Oracle reais).

## 7. Restore

Procedimento completo em `docs/operations/PRODUCTION-RUNBOOK.md`, secção 4
— não "corre o restore.sh", mas as 8 etapas reais: provisionar VM nova →
subir só o Postgres vazio → descarregar o backup do Object Storage →
restaurar → verificar schema e contagens de linhas → subir app+Caddy →
health check → validação funcional (login real) antes de reabrir aos
utilizadores. Inclui a nota sobre o IP público mudar numa VM nova e a
necessidade de atualizar `SITE_ADDRESS`.

`restore.sh`/`verify-backup.sh` em si **TESTADOS** (tarefa anterior, contra
Postgres real); o procedimento completo específico da Oracle (com
`rclone`/Object Storage reais) é **DOCUMENTADO**, **NÃO TESTADO — DEPENDE
DA ORACLE CLOUD**.

## 8. HTTPS

Resolvido sem custo, sem domínio próprio ainda:

- **Reverse proxy**: Caddy (`caddy:2-alpine`), escolhido em vez de Nginx
  por emitir/renovar certificados automaticamente sem Certbot separado —
  decisão justificada em `DECISIONS.md`.
- **Sem domínio (situação inicial)**: hostname `sslip.io` derivado do IP
  público da VM (ex. `203-0-113-10.sslip.io`) — **CONFIRMADO por pesquisa**
  que isto é suficiente para o Let's Encrypt validar via HTTP-01 e emitir
  um certificado real (técnica estabelecida, não um workaround inseguro).
- **Com domínio (futuro)**: só a variável `SITE_ADDRESS` muda; nada mais no
  `Caddyfile`/compose/código precisa de mudar.
- **NÃO TESTADO — DEPENDE DA ORACLE CLOUD**: a emissão real do certificado
  só acontece com um IP público real e o Caddy a correr de facto — não
  simulável neste sandbox.

## 9. Firewall

Duas camadas, ambas documentadas em `docs/operations/ORACLE-CLOUD.md`,
secção 4:

1. **Security List/NSG da Oracle**: 22 (SSH), 80 (HTTP, necessário para o
   desafio Let's Encrypt), 443 (HTTPS). Postgres (5432) nunca exposto.
2. **Firewall interno da imagem Ubuntu da Oracle** (a armadilha específica
   confirmada por pesquisa em fonte oficial da Oracle): bloqueia tudo
   menos SSH por omissão, independentemente da Security List — corrigido
   com `iptables -I INPUT ... -j ACCEPT` + `netfilter-persistent save`
   (a própria Oracle desaconselha `ufw` aqui, por poder colidir com as
   regras já existentes na imagem).

No `docker-compose.prod.yml`, só o serviço `caddy` publica portas (80/443)
— `app` e `db` só na rede interna do Compose.

## 10. Secrets

- `POSTGRES_PASSWORD`, `AUTH_SECRET` — gerados de novo para produção
  (nunca reutilizar valores de desenvolvimento), vivem só em
  `.env.production` no servidor, nunca commitados.
- `SITE_ADDRESS` — novo, não é secreto (é um hostname público por
  natureza), mas vive no mesmo `.env.production` por conveniência.
- Credenciais do Oracle Object Storage para o `rclone` — **não** vivem em
  `.env.production`; ficam em `~/.config/rclone/rclone.conf` no servidor,
  fora do repositório e fora de qualquer imagem Docker.
- `.gitignore`/`.dockerignore` — **CONFIRMADO** (inalterados nesta tarefa,
  já cobriam `.env*` com exceção só para os `*.example`) continuam a
  impedir qualquer segredo real de chegar ao Git ou à imagem Docker.

## 11. Deployment procedure

Guia completo, passo a passo, escrito para desenvolvimento em Windows:
`docs/operations/ORACLE-CLOUD.md` (criar a VM → SSH → firewall → Docker →
clonar → `.env` → migrações → subir containers → health check → HTTPS →
backups). Operações do dia-a-dia depois do primeiro deploy (atualizar,
rollback, restauro completo, monitorização):
`docs/operations/PRODUCTION-RUNBOOK.md`.

## 12. Billing safety

Ver `docs/operations/ORACLE-CLOUD.md`, secções "Custo" e "Billing Safety",
para a tabela completa componente a componente e as regras concretas.
Resumo: usar exatamente 1 VM `VM.Standard.A1.Flex` (2 OCPU/12 GB — o limite
atual, confirmado reduzido de 4/24 em 15/06/2026), 1 boot volume (50 GB),
1 bucket Object Storage (dentro de 20 GB); nunca aceitar nenhum prompt de
"upgrade to Pay As You Go"; configurar um Budget de $0–1 no Console da
Oracle com alerta por email como rede de segurança adicional contra
qualquer desvio do Always Free.

## 13. Limitations

O que não conseguimos garantir antes do deploy real, honestamente:

- **ARM64 por execução real** — só confirmado por inspeção/pesquisa nesta
  tarefa; a Oracle é o primeiro sítio onde um `docker build`/`up` real
  acontece.
- **HTTPS/certificado real** — o fluxo Caddy+sslip.io é sólido em teoria e
  confirmado por pesquisa, mas nunca foi executado (precisa de IP público
  real).
- **Backup para Oracle Object Storage** — o mecanismo (`rclone`) é
  genérico e já testado com um destino equivalente; o destino Oracle
  concreto (bucket, credenciais, lifecycle rule) só existe depois de
  criares a conta.
- **Capacidade para 100 utilizadores** — estimativa razoável, não medida;
  o ponto de atenção identificado (`listAllTransactionsForBalances` sem
  paginação) já era conhecido do audit original, não uma descoberta nova
  desta tarefa.
- **Firewall interno da Oracle** — o comando `iptables` documentado segue
  a recomendação oficial da Oracle, mas não foi executado numa VM Oracle
  real dentro desta tarefa.

Nenhuma destas limitações é um problema de código ou de arquitetura — são,
todas, passos que só existem quando a VM real existir.

## 14. Next step

O que precisas de fazer manualmente na Oracle Cloud, por ordem:

1. Criar a conta Oracle Cloud (cartão para verificação, sem implicar
   cobrança dentro do Always Free).
2. Seguir `docs/operations/ORACLE-CLOUD.md`, secções 1 a 15, de ponta a
   ponta — criar a VM, configurar o firewall (as duas camadas), instalar
   Docker, clonar o repositório, configurar `.env.production` (incluindo
   `SITE_ADDRESS` com o teu IP público em formato sslip.io), aplicar as
   migrações, subir os containers, confirmar HTTPS e o health check, e
   configurar o backup diário com destino no Object Storage.
3. Confirmar por execução real, na própria VM: o build ARM64 sobe sem
   erros, o certificado HTTPS é emitido, e um ciclo completo de backup →
   upload → `verify-backup.sh` funciona.
4. Só depois disso, seguir a recomendação de faseamento já dada no
   `KONTA_BETA_GATE.md`: abrir primeiro a um grupo pequeno de confiança
   (2–3 pessoas) antes dos 10–30 utilizadores da Beta completa.

Nada disto precisa de mais trabalho de código — é executar, na Oracle
real, o que está documentado.
