# Konta — Guia de deploy ZERO-COST (Render + Neon)

Guia passo a passo para colocar o Konta online sem gastar dinheiro, sem
esperar pela Oracle Cloud, escrito para quem desenvolve em Windows. Ver
`docs/ZERO_COST_DEPLOYMENT_AUDIT.md` para a análise completa e a
justificação de cada decisão — este documento é só o "como".

**Convenção de rigor**: **CONFIRMADO** (verificado nesta tarefa, por
leitura de código ou fonte oficial), **DOCUMENTADO** (procedimento correto,
sem execução possível neste ambiente), **NÃO TESTADO — DEPENDE DO SERVIÇO
REAL** (só confirmável depois de criares as contas).

---

## 1. Criar a base de dados (Neon)

**DOCUMENTADO.**

1. Cria conta em [neon.tech](https://neon.com) via GitHub — **CONFIRMADO
   que não pede cartão de crédito** (verificado nesta tarefa).
2. **Create a project** — nome sugerido `konta-prod`, região à tua escolha
   (a mais próxima dos teus utilizadores da Beta).
3. No painel do projeto, **Connection Details** → copia a connection
   string completa (formato `postgresql://user:password@ep-xxxx.neon.tech/neondb?sslmode=require`).
   Guarda-a já num gestor de passwords — é o valor que vai para
   `DATABASE_URL`.

## 2. Aplicar o schema

**DOCUMENTADO** (mesmos ficheiros SQL já usados em desenvolvimento — nada
muda no schema em si, só o destino da ligação):

No Windows, com o cliente `psql` instalado (vem com o instalador do
PostgreSQL em [postgresql.org/download/windows](https://www.postgresql.org/download/windows/),
ou via WSL):

```powershell
psql "postgresql://user:password@ep-xxxx.neon.tech/neondb?sslmode=require" -f prisma\manual-sql\0001_init.sql
psql "postgresql://user:password@ep-xxxx.neon.tech/neondb?sslmode=require" -f prisma\manual-sql\0002_seed_categories.sql
psql "postgresql://user:password@ep-xxxx.neon.tech/neondb?sslmode=require" -f prisma\manual-sql\0003_add_last_login.sql
psql "postgresql://user:password@ep-xxxx.neon.tech/neondb?sslmode=require" -f prisma\manual-sql\0004_add_feedback.sql
psql "postgresql://user:password@ep-xxxx.neon.tech/neondb?sslmode=require" -f prisma\manual-sql\0005_add_ai_access_toggle.sql
psql "postgresql://user:password@ep-xxxx.neon.tech/neondb?sslmode=require" -f prisma\manual-sql\0006_ai_access_default_false_for_new_users.sql
```

Alternativa: dá-me a connection string temporariamente (por um canal
seguro, não em texto simples numa mensagem pública) e corro estes comandos
a partir daqui — o essencial é confirmar depois com:

```bash
psql "$DATABASE_URL" -c '\dt'
```

que as tabelas (`User`, `Account`, `Transaction`, `Category`, etc.) existem.

**Base de dados já em produção, com migrações anteriores já aplicadas**:
cada ficheiro novo em `prisma/manual-sql/` (nome `000N_descrição.sql`,
ordem crescente) é uma migração a mais, nunca uma substituição das
anteriores — corre só o(s) ficheiro(s) que ainda não aplicaste, pela mesma
ordem. Por exemplo, se já tens `0001`–`0005` aplicados e só falta a mais
recente (`0006_ai_access_default_false_for_new_users.sql`, muda o DEFAULT
da coluna `aiEnabled` de `true` para `false` — só afeta quem se registar
a partir de agora, nunca os utilizadores já existentes), corre só essa,
isoladamente:

```powershell
psql "postgresql://user:password@ep-xxxx.neon.tech/neondb?sslmode=require" -f prisma\manual-sql\0006_ai_access_default_false_for_new_users.sql
```

Faz sempre um backup antes (secção 5) — pequeno neste caso (`CREATE TABLE`
nova, sem tocar em nenhuma tabela existente), mas é a rotina a manter
sempre que houver uma migração nova.

## 3. Criar o Web Service (Render)

**DOCUMENTADO.**

1. Cria conta em [render.com](https://render.com) via GitHub —
   **CONFIRMADO que não é exigido cartão de crédito** para o Free tier
   (`render.com/docs/free`: sem cartão associado, ultrapassar limites
   gratuitos só **suspende** o serviço, nunca cobra).
2. **New +** → **Blueprint** → escolhe o repositório do Konta no GitHub —
   o Render deteta automaticamente o `render.yaml` já incluído neste
   repositório e propõe criar o serviço `konta` (Docker, plano Free,
   `healthCheckPath: /api/health`) — confirma a criação.
   - Alternativa sem Blueprint: **New +** → **Web Service** → escolher o
     repositório → Runtime "Docker" (o `Dockerfile` na raiz é detetado
     automaticamente) → Plan "Free".
3. Quando pedido (variáveis marcadas `sync: false` no `render.yaml`),
   preenche:
   - `DATABASE_URL`: a connection string do Neon (secção 1).
   - `AUTH_SECRET`: gera um novo — `openssl rand -base64 48` (podes correr
     isto no PowerShell via WSL, ou pedir-me para gerar um).
   - `ADMIN_EMAILS` (opcional — ver `.env.render.example`): o teu próprio
     email de login do Konta, para veres a página `/admin` (Estatísticas).
     Sem esta variável, essa página devolve 404 para toda a gente.
4. Deploy. A primeira build demora alguns minutos (build da imagem Docker,
   igual ao processo já validado localmente para a Oracle).

**NÃO TESTADO — DEPENDE DO SERVIÇO REAL**: o `docker build` real no Render
corre em x86 (ao contrário da VM ARM64 da Oracle) — isto na verdade
**remove** a única incerteza de compatibilidade identificada no plano
Oracle (ver `docs/architecture/DECISIONS.md`, "ARM64: confirmado por
inspeção..."): todas as dependências deste projeto têm build nativo x64
maduro e testado há anos, sem nenhuma das perguntas específicas de
ARM64/musl. A única coisa que continua sem confirmação por execução real
é o comportamento específico da infraestrutura do Render em si (tempo de
build, spin-down real).

## 4. Confirmar o deploy

**DOCUMENTADO** (endpoint já existente e testado nas tarefas de
hardening anteriores):

```bash
curl -i https://konta-xxxx.onrender.com/api/health
```

Deve devolver `200`. Depois, testar o fluxo real no browser: registo →
login → criar conta → criar transação → confirmar que o cookie de sessão
persiste entre páginas (mesma origem, `sameSite: "lax"` continua a
funcionar sem nenhuma alteração — ver `ZERO_COST_DEPLOYMENT_AUDIT.md`,
secção 1).

## 5. Backup manual

**DOCUMENTADO — limitação aceite explicitamente, não escondida: não há
backup automático nesta fase.**

```bash
DATABASE_URL="postgresql://user:password@ep-xxxx.neon.tech/neondb?sslmode=require" \
  ./scripts/backup/backup-neon.sh
```

Produz um ficheiro `.dump` em `./backups/`. **Move este ficheiro para fora
de qualquer pasta sincronizada com o Git antes de o guardares** — contém
dados financeiros reais dos utilizadores da Beta.

**Rotina sugerida**: uma vez por semana, e sempre antes de qualquer mudança
grande (migração de schema, etc.). Se preferires, pede-me para correr isto
periodicamente a partir daqui (dando-me a connection string) e eu
entrego-te o ficheiro `.dump` via download.

**Verificação ocasional (opcional, mas recomendada pelo menos uma vez)**:
restaurar o `.dump` para um Postgres local (o que já usas em
desenvolvimento, `docker-compose.yml`) e confirmar que os dados aparecem:

```bash
docker compose exec -T db pg_restore -U konta -d konta_dev --clean --if-exists < backups/konta_neon_<timestamp>.dump
```

Isto prova que o backup é mesmo restaurável, não só que o ficheiro existe —
o mesmo princípio do `verify-backup.sh` original, feito manualmente aqui em
vez de automatizado (não vale a pena construir automação nova para um
processo que já é manual por decisão).

## 6. Domínio próprio (mais tarde)

**DOCUMENTADO**, não implementado agora (orçamento $0, sem domínio
comprado). Quando decidires comprar um domínio:

1. No painel do Render, serviço `konta` → **Settings** → **Custom Domains**
   → adicionar `konta.app` (ou o domínio escolhido).
2. Configurar o registo DNS que o Render indicar (tipicamente um `CNAME`)
   junto do teu registador de domínio.
3. O Render emite e renova o certificado HTTPS automaticamente para o
   domínio novo — sem Caddy, sem Certbot, sem nada a configurar à mão.

Não é preciso nenhum subdomínio `api.konta.app` separado — é a mesma
aplicação, um único domínio custom basta (ver
`ZERO_COST_DEPLOYMENT_AUDIT.md`, secção 7).

## 7. Custo (resumo — tabela completa no audit)

| Componente | Serviço | Custo |
|---|---|---|
| App (frontend+API) | Render Free Web Service | $0 |
| Base de dados | Neon Free | $0 |
| HTTPS | Gerido pelo Render | $0 |
| Backup | Manual, local | $0 |

## 8. O que fica diferente do plano Oracle Cloud

- `docker-compose.prod.yml`/`Caddyfile`/`scripts/backup/backup.sh`
  (feitos para a Oracle) **não são usados neste caminho** — ficam no
  repositório, documentados, como opção de self-host para o dia em que
  fizer sentido deixar de depender de free tiers de terceiros.
  `docs/operations/ORACLE-CLOUD.md` continua válido para essa altura.
- Sem reverse proxy nosso (Caddy) — o Render já resolve isso.
- Sem container de Postgres nosso — o Neon já resolve isso.
- Backup deixa de ter destino automático (Object Storage) — é manual
  nesta fase, ver secção 5.
