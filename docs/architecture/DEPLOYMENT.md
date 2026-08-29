# Konta — Deployment (Pre-Beta Hardening, Prioridade 12; concretizado para
# Oracle Cloud Always Free na preparação de deploy $0 seguinte)

Este documento responde à pergunta que o `GO_TO_BETA_AUDIT.md` deixou em
aberto (secção 16, achado 6.1): **como é que isto corre num servidor real**,
para uma Beta de 10–30 utilizadores. Cobre a decisão de hosting (com
justificação, não preferência), a imagem de produção, as variáveis de
ambiente, migrações, o processo de arranque e como tudo isto se liga a
`BACKUP.md`.

**Atualização (preparação de deploy Oracle Cloud, orçamento $0)**: a decisão
de hosting deste documento ("um único VPS + Docker Compose") foi mantida
sem alterações arquiteturais — só concretizada para um fornecedor específico
que cobre o requisito de orçamento zero, a Oracle Cloud Always Free. Ver
`docs/operations/ORACLE-CLOUD.md` para o procedimento passo a passo completo
(criar a VM, SSH a partir de Windows, firewall, Docker, HTTPS sem domínio,
backups) e `docs/operations/PRODUCTION-RUNBOOK.md` para as operações do
dia-a-dia depois de estar em produção (atualizar, rollback, restaurar).

## 1. Decisão: um único VPS + Docker Compose (não uma plataforma gerida) — concretizado como Oracle Cloud Always Free

**Critérios usados** (não "gosto mais de X"): para 10–30 utilizadores, a
prioridade é (a) backups reais e verificáveis sob o nosso controlo direto —
ver a exigência explícita em `BACKUP.md`/Prioridade 1 — (b) reaproveitar o
investimento já feito e validado no `docker-compose.yml` de desenvolvimento,
e (c) custo previsível e baixo, sem depender de múltiplas contas/faturas para
uma aplicação pequena. A esta lista soma-se agora um quarto critério,
explícito e não negociável: **(d) orçamento atual = $0**, sem VPS pago, sem
domínio pago, sem base de dados gerida paga.

**Opção escolhida**: **Oracle Cloud Infrastructure (OCI), tier Always
Free**, especificamente uma VM Ampere A1 (ARM64), porque é o único dos
critérios de "qualquer VPS com Docker" (Hetzner/DigitalOcean/Linode, todos
pagos desde o primeiro dia) que também satisfaz (d) — a Oracle é, confirmado
por pesquisa nesta tarefa, a única grande cloud com uma camada "Always Free"
que inclui uma VM com Docker, disco persistente e SSH continuamente, sem
cartão a ser cobrado enquanto os limites forem respeitados (ver
`docs/operations/ORACLE-CLOUD.md`, secção "Custo" e "Billing Safety", para
os limites exatos e como não os ultrapassar).

Continua a correr, sem nenhuma mudança de arquitetura:
- `docker-compose.prod.yml` — Postgres 16 (serviço `db`) + a app Next.js
  (serviço `app`, construída a partir do `Dockerfile` deste repositório) +,
  desde a preparação de deploy, um reverse proxy Caddy (serviço `caddy`,
  ver secção 3 "HTTPS" abaixo) — o único serviço exposto à internet.
- `scripts/backup/backup.sh` num cron/systemd timer diário, agora com
  destino externo real documentado: Oracle Object Storage (ver `BACKUP.md`).

**Porque não uma VM x86 Always Free da Oracle (`VM.Standard.E2.1.Micro`) em
vez de ARM64**: a Oracle também oferece até duas VMs x86 minúsculas (1/8
OCPU, 1 GB RAM cada) sempre grátis — mas 1 GB de RAM é apertado para
Postgres + Next.js + Caddy a correr em simultâneo, mesmo para uma Beta
pequena. A VM Ampere A1 (ARM64) oferece, isoladamente, muito mais CPU/RAM
dentro do Always Free (ver secção "Capacidade" em `ORACLE-CLOUD.md`) — o
custo dessa escolha é exigir confirmar compatibilidade ARM64 da imagem
Docker, coberto na secção 8 abaixo.

**Alternativa considerada e posta de lado por agora**: Vercel (ou
equivalente) para a app + uma base de dados Postgres gerida (Neon, Supabase,
RDS). Foi rejeitada **para já**, não para sempre, por três razões concretas:
1. A Prioridade 1 exige uma solução de backup **real e testável por nós**
   (`pg_dump`/`pg_restore` verificados a sério — ver `BACKUP.md`). Isso é
   direto de garantir quando controlamos o Postgres; com um serviço gerido,
   dependeríamos inteiramente da política de backup desse fornecedor, que
   normalmente só é auditável/restaurável nos planos pagos mais caros.
2. Dividir uma aplicação pequena por duas contas/faturas/painéis de operação
   (hosting da app + hosting da base de dados) é complexidade operacional
   extra sem benefício real a 10–30 utilizadores.
3. Reaproveita o `docker-compose.yml` já validado localmente pelo utilizador
   (ver `WINDOWS_SETUP.md`) — o mesmo modelo mental de "sobe com Docker",
   sem reescrever nada.

**Quando reconsiderar**: se o número de utilizadores crescer muito além da
Beta, ou se a operação de backups manuais se tornar trabalhosa, uma base de
dados gerida com backups automáticos point-in-time passa a valer a
complexidade extra. Não é preciso decidir isso agora.

## 2. Imagem de produção (`Dockerfile`)

Build multi-stage baseado em `output: "standalone"` (ver `next.config.ts`):

1. `deps` — `npm ci` a partir do `package-lock.json` (build reprodutível).
2. `builder` — `npm run build`. Confirmado neste ambiente: gera
   `.next/standalone/server.js` + `.next/static/`.
3. `runner` — imagem final alpine mínima, corre como utilizador não-root
   (`nextjs`), só com o server standalone e os estáticos — sem código-fonte,
   sem devDependencies, sem `npm install` na imagem final.

**Verificação real feita nesta tarefa** (não assumida): não foi possível
correr `docker build` dentro deste sandbox de desenvolvimento — o registo
`docker.io` (e também `gcr.io`, `public.ecr.aws`) está bloqueado pela mesma
política de rede que já impede `binaries.prisma.sh` e `fonts.googleapis.com`
(ver `DECISIONS.md`, secção "Prisma neste ambiente"). Em vez disso, correu-se
`npm run build` diretamente e confirmou-se que:
- `.next/standalone/server.js` é gerado exatamente onde o `Dockerfile`
  espera copiar de (`COPY --from=builder .../.next/standalone ./`).
- Arrancar esse `server.js` diretamente (`node .next/standalone/server.js`)
  serve HTTP 200 em `/login` de facto — não é só "os ficheiros existem".

O `Dockerfile` em si segue o padrão oficial e amplamente usado da Next.js
para `output: "standalone"`; falta só confirmar o `docker build` completo
numa máquina com acesso normal ao Docker Hub (qualquer portátil ou o próprio
VPS de produção). **Isto deve ser o primeiro passo a fazer no VPS real,
antes de depender disto para a Beta** — não é um risco novo introduzido por
esta tarefa, é o mesmo tipo de limitação de rede do sandbox já documentado
para o Prisma.

## 3. Compatibilidade ARM64 (Oracle Cloud Ampere A1)

A VM Always Free escolhida (secção 1) é ARM64 (Ampere A1, arquitetura
`aarch64`/`arm64v8`), não x86. Isto muda a imagem base que o Docker vai
efetivamente descarregar para cada `FROM`, e por isso foi analisado a sério
nesta tarefa — não assumido.

**CONFIRMADO** (por leitura direta de `package.json`/`package-lock.json`
deste repositório): todas as dependências com binários nativos por
plataforma publicam uma variante `linux-arm64-musl` (Alpine usa musl, não
glibc) — a que interessa aqui, já que o `Dockerfile` usa `node:22-alpine`:
- `@next/swc-linux-arm64-musl` (compilador Rust do Next.js — a peça mais
  crítica, sem ela o `next build` não corre) — presente no
  `optionalDependencies` do `next@16.3.3` instalado.
- `@tailwindcss/oxide-linux-arm64-musl` e `lightningcss-linux-arm64-musl`
  (motor do Tailwind v4, usado durante o build).
- `@img/sharp-linuxmusl-arm64` (dependência opcional do Next.js, não usada
  por este código — nenhuma página importa `next/image` — mas presente no
  `node_modules` sem risco: tem variante ARM64/musl na mesma).
- `@prisma/client`/`prisma` (não usados em runtime — nenhum import real no
  código, ver `DECISIONS.md`, "Prisma neste ambiente") não têm nenhum script
  de `postinstall` que descarregue binários de rede: o único script do
  pacote `prisma` que corre na instalação (`preinstall`) só verifica a
  versão do Node.js instalada, não faz pedidos de rede nem escolhe
  plataforma. Confirmado por leitura direta do código desse script — zero
  risco de ARM64 vindo do Prisma, precisamente porque está dormente.

**CONFIRMADO por pesquisa** (não por memória/suposição — consultado nesta
tarefa): as imagens oficiais `node:22-alpine`, `postgres:16` e `caddy:2-alpine`
(usada pelo reverse proxy, secção 4) publicam manifestos multi-arquitetura
que incluem `arm64v8`/`aarch64` — confirmado via a página de cada imagem
oficial no Docker Hub.

**NÃO TESTADO — DEPENDE DA ORACLE CLOUD**: tentou-se, de propósito e a
sério nesta tarefa, correr `docker buildx build --platform linux/arm64`
dentro deste sandbox (o Docker está instalado e o daemon foi arrancado
propositadamente para este teste). O resultado foi um bloqueio de rede
total e confirmado, não um erro do Dockerfile: **todos** os registos de
imagens testados — `docker.io`, `gcr.io`, `public.ecr.aws`, `ghcr.io`,
`quay.io`, `registry.k8s.io`, `mcr.microsoft.com` — devolveram
`403 Forbidden`/`connect_rejected` da política de rede deste ambiente de
desenvolvimento (a mesma classe de restrição já documentada para o Prisma).
Não foi possível, portanto, provar por execução real que a imagem final
arranca em ARM64 — só por inspeção das dependências e da documentação
oficial, como descrito acima. **O primeiro `docker compose ... up --build`
feito na VM Oracle real é, também por isto, o momento em que esta
compatibilidade fica finalmente confirmada por execução — não antes.**

Não foi necessária nenhuma alteração ao `Dockerfile`/`docker-compose.prod.yml`
por causa do ARM64: nenhuma incompatibilidade foi encontrada, só a
impossibilidade de a confirmar por execução neste ambiente.

## 4. Variáveis de ambiente

- `.env.example` — desenvolvimento local (já existia).
- `.env.production.example` — modelo para produção (novo, ver ficheiro).
  Copiar para `.env.production` no servidor e preencher com valores reais.
  **Nunca commitar `.env.production`** — o `.gitignore` já o exclui (`.env*`
  continua a apanhar qualquer `.env`/`.env.production` real; só os
  `*.example` foram explicitamente destacados como exceção, ver correção
  nesta tarefa).

Variáveis usadas pela aplicação (confirmado por leitura do código, não
assumido): `DATABASE_URL`, `AUTH_SECRET`, `NODE_ENV` (`process.env.NODE_ENV
=== "production"` liga o cookie de sessão como `secure` — ver
`src/app/api/auth/login/route.ts`/`register/route.ts`). **Consequência
direta**: em produção a app TEM de correr atrás de HTTPS, ou o cookie
`secure` nunca é aceite pelo browser e ninguém consegue manter sessão
iniciada.

**Resolvido na preparação de deploy Oracle Cloud** (estava em aberto na
versão anterior deste documento): reverse proxy Caddy (serviço `caddy` em
`docker-compose.prod.yml`, ver `Caddyfile`), que obtém e renova certificados
HTTPS automaticamente. A variável nova `SITE_ADDRESS` (ver
`.env.production.example`) resolve especificamente o problema de "ainda não
temos domínio, orçamento é $0": aponta para um hostname gratuito de
terceiros do tipo `<ip-da-vm-com-hifens>.sslip.io` (ex.
`203-0-113-10.sslip.io`), que resolve publicamente para o próprio IP da VM
— suficiente para o Let's Encrypt validar e emitir um certificado real, sem
comprar nada. Quando um domínio próprio existir, só `SITE_ADDRESS` muda
(para o domínio); o Caddyfile e o resto do compose ficam exatamente iguais.
Ver `docs/operations/ORACLE-CLOUD.md` para o procedimento completo e
`DECISIONS.md` para a justificação de escolher Caddy em vez de Nginx.

## 5. Migrações

Mesma mecânica documentada em `WINDOWS_SETUP.md`, aplicada ao servidor: os
ficheiros em `prisma/manual-sql/*.sql` são a fonte de verdade **enquanto o
Prisma CLI não puder correr** (ver `DECISIONS.md`). Processo de arranque num
servidor novo:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d db
# esperar o healthcheck do "db" ficar healthy:
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U konta -d konta -f /migrations/0001_init.sql
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U konta -d konta -f /migrations/0002_seed_categories.sql
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build app caddy
```

`docker-compose.prod.yml` já monta `./prisma/manual-sql` como `/migrations`
dentro do container `db` (read-only), tal como o compose de desenvolvimento.

## 6. Processo de arranque (resumo end-to-end)

Ver `docs/operations/ORACLE-CLOUD.md` para a versão detalhada, passo a
passo, específica da Oracle Cloud (para quem desenvolve em Windows). Resumo:

1. Provisionar a VM (Oracle Cloud Always Free, Ampere A1, Ubuntu 24.04) e
   instalar Docker + Docker Compose.
2. Abrir as portas 80/443 (SSH/22 já vem aberta) — tanto na Security
   List/NSG da Oracle como no firewall interno do Ubuntu (ver
   `ORACLE-CLOUD.md`, gotcha específico da Oracle: o firewall interno da
   imagem Ubuntu bloqueia tudo menos SSH por omissão, independentemente da
   Security List).
3. Copiar o repositório para o servidor (`git clone`/`git pull`).
4. `cp .env.production.example .env.production` e preencher os valores
   reais (`POSTGRES_PASSWORD`, `AUTH_SECRET` gerado com `openssl rand
   -base64 48`, `SITE_ADDRESS` com o hostname sslip.io do IP público da VM).
5. Subir a base de dados e aplicar as migrações (secção 5).
6. Construir e subir a app e o Caddy: `docker compose -f
   docker-compose.prod.yml --env-file .env.production up -d --build app
   caddy`.
7. Confirmar `GET https://<SITE_ADDRESS>/api/health` devolve 200 — a
   confirmação de que o Caddy conseguiu mesmo emitir o certificado.
8. Configurar o backup diário (`BACKUP.md` + `ORACLE-CLOUD.md`, cron ou
   systemd timer) com destino externo no Oracle Object Storage.

## 7. Segredos fora do repositório

- `.env`, `.env.production` — ignorados pelo `.gitignore` (`.env*`).
- `.dockerignore` exclui `.env`/`.env.*` explicitamente do contexto de
  build, para nenhum segredo de desenvolvimento acabar dentro da imagem por
  engano (confirmado: `npm run build` local copia um `.env` presente no
  diretório para `.next/standalone/.env` — é esperado e inofensivo em dev,
  mas é exatamente por isto que o `.dockerignore` impede que exista sequer um
  `.env` no contexto quando se faz `docker build`; as variáveis reais em
  produção chegam só via `environment:`/`--env-file` do Compose, nunca
  copiadas para dentro da imagem).
- `AUTH_SECRET`/`POSTGRES_PASSWORD` de produção têm de ser gerados de novo,
  nunca reutilizados dos valores de desenvolvimento (`konta_dev_pw`, etc.).
- `SITE_ADDRESS` (novo, secção 4) não é um segredo — é um hostname público,
  o próprio objetivo é ele ser resolvível pela internet para o Let's
  Encrypt validar o certificado. Fica no mesmo `.env.production` só por
  conveniência (uma única fonte de configuração de produção), não por
  precisar de sigilo.
- Credenciais do Oracle Object Storage para o `rclone` (backup externo, ver
  `BACKUP.md`) **não vivem em `.env.production`** — ficam na configuração
  própria do `rclone` no servidor (`~/.config/rclone/rclone.conf`, fora do
  repositório, nunca copiada para dentro de nenhuma imagem Docker).

## 8. Logs e saúde (referência cruzada)

- `GET /api/health` — Prioridade 6 desta tarefa (implementado depois deste
  grupo; o healthcheck do serviço `app` em `docker-compose.prod.yml` já
  aponta para ele).
- Logging mínimo — Prioridade 5 desta tarefa (`src/lib/logger.ts`).

Estes dois só existem a partir dos grupos seguintes da mesma tarefa de
hardening; este documento já os referencia para não ficar desatualizado
assim que forem implementados.
