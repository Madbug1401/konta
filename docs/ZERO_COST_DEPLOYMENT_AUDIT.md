# ZERO-COST DEPLOYMENT AUDIT

**Data**: 29/08/2026
**Objetivo**: colocar o Konta online com utilizadores reais antes de ~15/09/2026, por $0, sem esperar pela Oracle Cloud (bloqueada pela verificação de cartão) e sem reescrever a aplicação.
**Convenção de rigor** (igual à usada nos documentos anteriores): **CONFIRMADO** (verificado por leitura direta do código deste repositório ou por fonte oficial consultada nesta tarefa), **TESTADO LOCALMENTE**, **DOCUMENTADO**, **NÃO TESTADO — DEPENDE DO SERVIÇO REAL** (só confirmável depois de criares as contas Render/Neon).

**Nenhuma alteração de código foi feita antes deste documento** — só leitura/análise, conforme pedido.

---

## 1. Arquitetura atual

**CONFIRMADO por leitura direta do código.** O ponto mais importante desta
análise, porque muda a resposta à pergunta do briefing: **o Konta não é um
frontend Next.js separado de uma API Node — é uma única aplicação Next.js
16 (App Router) onde o frontend e o "backend" são o mesmo processo.**

- **Onde o frontend corre**: páginas em `src/app/(app)/*` e `src/app/(auth)/*`
  são Server Components. Exemplo confirmado (`src/app/(app)/dashboard/page.tsx`):
  chamam **diretamente** `listAccounts(session.userId)`,
  `listAllTransactionsForBalances(...)` — funções de `src/lib/db/*.ts` que
  fazem SQL direto contra o Postgres via `pg.Pool`. **Não fazem `fetch` a
  nenhuma API interna.** Isto significa que renderizar uma página já exige
  acesso direto à base de dados, no mesmo processo.
- **Onde o Node "API" corre**: as mesmas rotas Route Handler
  (`src/app/api/**/route.ts`) fazem parte do **mesmo** processo Next.js —
  não existe um servidor Express/Node separado em lado nenhum do
  repositório. `npm start`/`node server.js` (build standalone) sobe as
  páginas e a API juntas, na mesma porta.
- **Como o frontend chama a API**: só os **Client Components** que fazem
  mutações usam `fetch()` — confirmado por leitura de todos os 5 pontos de
  chamada (`transaction-form.tsx`, `account-form.tsx`,
  `transaction-row-actions.tsx`, `(auth)/register/page.tsx`,
  `(auth)/login/page.tsx`). **Todos usam URLs relativas** (`fetch("/api/transactions")`,
  nunca uma URL absoluta) — pressupõe mesma origem. Confirmado por grep em
  todo o `src/`: zero ocorrências de `NEXT_PUBLIC_API_URL` ou qualquer URL
  absoluta apontada a uma API.
- **Como a autenticação funciona**: JWT próprio (`jose`), assinado em
  `/api/auth/login`/`register`, guardado num cookie `httpOnly`. A
  verificação (`getSessionUser()`, `src/lib/auth/session.ts`) lê o cookie
  **diretamente via `next/headers`** — corre dentro do próprio Server
  Component, no mesmo processo que teria de aceder à base de dados. Não há
  nenhum pedido de rede interno para "perguntar à API quem está logado".
- **Como os cookies funcionam**: `response.cookies.set(SESSION_COOKIE_NAME, token, { httpOnly: true, secure: NODE_ENV==="production", sameSite: "lax", path: "/" })`
  — confirmado em `src/app/api/auth/login/route.ts`. **Sem `domain`
  definido** (aplica-se ao host do próprio pedido) e **`sameSite: "lax"`**
  — este valor só envia o cookie em pedidos do mesmo site (ver secção
  "Auth/Cookies" abaixo para o que isto implica).
- **Como o CORS funciona**: **não funciona — não existe.** Confirmado por
  grep: zero ocorrências de `Access-Control-*`/CORS em todo o `src/`. Nunca
  foi necessário, porque a app sempre assumiu mesma origem.
- **Quais URLs são configuráveis**: nenhuma, hoje. Não há nenhuma variável
  de ambiente tipo `NEXT_PUBLIC_API_URL`/`API_BASE_URL` no código.
- **Como `DATABASE_URL` é usada**: `src/lib/db/client.ts`,
  `new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })`, um
  singleton por processo (`global.__kontaPgPool`), com `pool.on('error', ...)`
  já tratado (Pre-Beta Hardening). Aceita qualquer connection string
  padrão `postgresql://user:pass@host/db?sslmode=require` — nenhuma
  suposição sobre o host ser local/Docker.
- **Confirmado também por leitura do `server.js` gerado**
  (`.next/standalone/server.js`, já existente deste repositório):
  `const currentPort = parseInt(process.env.PORT, 10) || 3000` e
  `hostname = process.env.HOSTNAME || '0.0.0.0'` — a app já respeita a
  porta/host vindos do ambiente em runtime, não tem nada hardcoded que
  impeça correr atrás de uma porta atribuída por uma plataforma como o
  Render.

## 2. Compatibilidade Vercel + Render + Neon

**Neon (base de dados) — CONFIRMADO compatível, sem nenhuma alteração de
código.** `DATABASE_URL` já é uma variável de ambiente; a connection string
que o Neon fornece (`postgresql://...?sslmode=require`) é exatamente o
formato que `pg.Pool({ connectionString })` já aceita.

**Vercel + Render, exatamente como no diagrama do briefing (frontend numa
origem, API noutra) — NÃO compatível sem alterações reais, pelas razões da
secção 1:**
1. Os Server Components (o "frontend") acedem à base de dados
   **diretamente** — não pedem à API. Pôr só "a API" no Render e "o
   frontend" na Vercel deixaria o frontend sem forma de mostrar nada, a
   menos que o Vercel também tivesse acesso direto ao Postgres (o que
   dissolve a separação pretendida) **ou** se reescrevesse cada Server
   Component para deixar de aceder à base de dados diretamente e passar a
   fazer `fetch` a uma API remota — isto é uma reescrita real da aplicação,
   explicitamente fora do pedido.
2. Os `fetch("/api/...")` das mutações teriam de passar a apontar para um
   domínio diferente (`https://konta-api.onrender.com/...`) — mudança de
   código pequena mas real em 5 ficheiros.
3. O cookie de sessão, com `sameSite: "lax"`, **não é enviado** em pedidos
   `fetch` entre origens diferentes (é exatamente para isto que o `lax`
   existe). Resolver isto exigiria mudar para `sameSite: "none"` (que
   obriga a `secure: true`, já verdade em produção) **e** configurar CORS
   explícito (`Access-Control-Allow-Origin` com o domínio exato da Vercel,
   `Access-Control-Allow-Credentials: true`, e `credentials: "include"` em
   cada `fetch`) em todas as rotas de mutação — uma alteração de segurança
   não trivial, espalhada por várias rotas, exatamente o tipo de "alteração
   insegura só para fazer funcionar" que o briefing pediu para evitar.

**Vercel a correr a aplicação Next.js inteira (frontend + rotas de API
juntas, sem split) — tecnicamente compatível sem reescrever nada, mas com
um problema de fundo, não técnico:** a Vercel tem o seu próprio pipeline de
build para Next.js e **não usa o `Dockerfile` deste repositório de
maneira nenhuma** — o `output: "standalone"` (feito de propósito para
Docker/self-host) é irrelevante para a Vercel. Cada rota `/api/*` passa a
correr como uma **Vercel Serverless Function** — não por termos escrito
código serverless, mas porque é assim que a própria Vercel executa
qualquer rota de API do Next.js. Isto entra em tensão direta com o pedido
explícito "NÃO quero transformar o backend em serverless": não seria uma
reescrita, mas seria, de facto, servir o backend em funções serverless.

**Render a correr a aplicação Next.js inteira (frontend + API juntas, o
mesmo processo, um único serviço, usando o `Dockerfile` já existente
tal como está) — CONFIRMADO compatível, zero alterações de código.**
Mantém a app exatamente como corre hoje (um processo Node persistente, não
serverless), reaproveita 100% do investimento em Docker já feito para a
Oracle, preserva `sameSite: "lax"` e URLs relativas sem tocar em nada.

**Conclusão desta secção — recomendação já adiantada, justificada em
detalhe na secção 7**: usar **Render (um único serviço, tudo junto) +
Neon**, e **não usar a Vercel** no plano principal. Isto muda o diagrama do
briefing (que separava "frontend na Vercel" de "API no Render"), mas é a
única forma de cumprir ao mesmo tempo "não reescrever", "não tornar
serverless" e "$0" — ver secção 3 para os problemas concretos que o
diagrama original geraria, e secção 7 para a arquitetura recomendada.

## 3. Problemas encontrados

1. **Vercel Hobby restringe a uso não-comercial/pessoal — CONFIRMADO na
   documentação oficial da própria Vercel**, consultada nesta tarefa
   (`vercel.com/docs/plans/hobby`, atualizada em 11/08/2026): *"the Hobby
   plan restricts users to non-commercial, personal use only"*. Uma Beta
   com utilizadores reais de uma aplicação pensada para se tornar um
   produto está, no mínimo, numa zona cinzenta desses termos — mais um
   motivo concreto (além do técnico da secção 2) para não usar a Vercel
   aqui, não só uma preferência.
2. **Render Free Postgres expira 30 dias após a criação — CONFIRMADO**
   na documentação oficial do Render consultada nesta tarefa
   (`render.com/docs/free`): *"Free Render Postgres databases expire 30
   days after creation"*, com apenas 1 GB de armazenamento. Confirma
   exatamente a restrição que o briefing já assumia — **não vamos usar
   Postgres do Render de maneira nenhuma**, só o Web Service. O Postgres é
   inteiramente Neon.
3. **Render Free faz spin-down ao fim de 15 minutos sem tráfego, ~1 minuto
   para acordar — CONFIRMADO** na documentação oficial (`render.com/docs/free`).
   Aceite explicitamente no briefing ("aceitamos cold starts").
4. **Render Free dá 512 MB de RAM por instância** — não é um bloqueio para
   10–30 utilizadores de uma app sem processamento pesado, mas é um limite
   real a vigiar (não confirmado como suficiente por execução real — só
   por análise: Next.js standalone + Postgres pool de 5 ligações não deve
   aproximar-se disto em uso normal, mas fica como risco documentado, não
   garantia).
5. **Os scripts de backup feitos para a Oracle (`backup.sh`/`restore.sh`/
   `verify-backup.sh`) não funcionam tal como estão neste novo cenário** —
   foram escritos à volta de `docker compose exec db pg_dump` (um
   container Postgres local, controlado por nós). O Neon é um Postgres
   gerido, remoto, sem container Docker nosso para lhe aceder — o
   mecanismo de backup tem de mudar para `pg_dump` direto contra a
   connection string do Neon (ver secção 6 do plano, "Backups").
6. **`docker-compose.prod.yml`/`Caddyfile` (feitos para a Oracle) ficam sem
   uso neste caminho** — o Render já fornece HTTPS gerido e routing, não
   precisamos de Caddy nem de correr o Postgres nós próprios em Docker.
   Não é um problema, é só uma constatação: esse trabalho fica documentado
   como caminho alternativo de self-host futuro (`docs/operations/ORACLE-CLOUD.md`
   continua válido se um dia quiseres deixar de depender de free tiers),
   não é preciso apagar nada.

## 4. Alterações necessárias

**Nenhuma alteração ao código da aplicação (`src/`) é necessária** — esta é
a conclusão prática da análise: ao escolher Render (um único serviço) +
Neon, tudo o que já existe (URLs relativas, `sameSite: "lax"`, sem CORS,
`DATABASE_URL` como variável de ambiente, `Dockerfile` já pronto) continua
válido sem tocar em nenhuma linha.

O que muda, e é pequeno e seguro (implementado a seguir a este documento):
1. Um `.env.render.example` novo (paralelo ao `.env.production.example` já
   existente, que continua a servir o caminho Docker Compose/Oracle) — só
   as variáveis que o caminho Render+Neon precisa: `DATABASE_URL`,
   `AUTH_SECRET`, `NODE_ENV`. Sem `POSTGRES_*`/`SITE_ADDRESS` (não
   aplicáveis aqui).
2. Um `render.yaml` (Blueprint do Render) — declarativo, descreve o
   serviço a criar a partir do `Dockerfile` já existente; não altera nada
   dentro da aplicação.
3. Um script de backup novo, `scripts/backup/backup-neon.sh` — mesma
   lógica de fundo do `backup.sh` original (dump comprimido, timestamp,
   verificação básica), adaptado para correr `pg_dump` diretamente contra
   `DATABASE_URL` (sem `docker compose exec`), pensado para correr
   manualmente (ver secção "Backups" do plano).
4. Documentação nova: `docs/operations/RENDER-NEON.md` (equivalente ao
   `ORACLE-CLOUD.md`, mas para este caminho) e uma entrada em
   `DECISIONS.md` a registar esta mudança de rumo.

## 5. Riscos

- **Cold start (~1 min) depois de 15 min de inatividade** — aceite
  explicitamente no briefing.
- **512 MB RAM** — limite real, não testado sob carga; mitigação:
  monitorizar via os próprios logs/painel do Render nas primeiras semanas
  de Beta, sem custo de upgrade previsto agora.
- **Backup manual, não automático** — risco humano de esquecimento
  (alguém tem de se lembrar de correr o script); mitigado só por rotina e
  por estar claramente documentado como limitação, nunca apresentado como
  "resolvido".
- **Termos de uso não-comercial da Vercel** — risco de conformidade, não
  técnico; mitigado por simplesmente não usar a Vercel no caminho
  recomendado.
- **Suspensão em vez de cobrança ao ultrapassar limites gratuitos** —
  CONFIRMADO como o comportamento do Render sem cartão associado
  (`render.com/docs/free`: *"If you haven't added a payment method, Render
  instead suspends all of your Free services for the remainder of the
  mês"*) — seguro do ponto de vista financeiro (nunca cobra sem cartão),
  mas é uma possível interrupção de serviço se os limites forem
  ultrapassados. Para 1 único serviço a correr com spin-down normal, as
  750 horas/mês do Render dão folga confortável mesmo num mês de 31 dias
  (744 horas se corresse 24/7 sem nunca adormecer).
- **Sem alta disponibilidade, sem SLA** — aceite explicitamente.
- **Dependência de três fornecedores gratuitos distintos (GitHub, Render,
  Neon)** em vez de um só (Oracle) — mais superfícies onde algo pode mudar
  unilateralmente (limites, política), mas nenhum exige cartão, o que
  elimina o bloqueio concreto que impediu a Oracle.

## 6. Limitações

Aceites conscientemente para esta fase, documentadas em vez de escondidas:

- Sem backup automático — só manual, periódico, para o computador do
  proprietário (ver plano, secção "Backups"). **Não existe backup
  automático nesta fase** — não fingir que existe.
- Sem alta disponibilidade, sem SLA, sem observabilidade avançada (decisão
  já tomada nas fases anteriores, mantida).
- URLs temporárias (`*.onrender.com`) até um domínio próprio existir —
  aceite explicitamente.
- Cold starts, performance inferior a um serviço sempre ligado — aceite
  explicitamente.
- Sem CI/CD automático nesta fase — deploy pelo próprio botão/integração
  Git do Render (git push → deploy automático, isto é nativo do Render,
  não uma peça extra a construir).

## 7. Arquitetura recomendada

```
Windows
   │  git push
   ▼
GitHub
   │
   ▼
Render (Free Web Service, Docker, usando o Dockerfile já existente)
   │
   │  Next.js 16 completo — frontend (Server Components) + API
   │  (Route Handlers) no MESMO processo, exatamente como corre hoje
   │
   ▼
Neon (Postgres gerido, Free tier)
```

**A Vercel não faz parte do caminho recomendado** — não porque seja um mau
produto, mas porque, para esta aplicação especificamente (Server Components
com acesso direto à base de dados, backend pensado para correr como
processo persistente, não serverless), colocar a app na Vercel ou obriga a
aceitar execução serverless (contra o pedido explícito) ou obriga a separar
frontend/API em duas origens diferentes (o que, pela secção 2, exige
reescrever partes reais da aplicação — também contra o pedido explícito).
O Render, a correr a app inteira tal como o `Dockerfile` já a construía
para a Oracle, cumpre as três restrições ao mesmo tempo: $0, sem
reescrever, sem serverless.

**Trocar depois para domínio próprio** (sem alterar esta arquitetura):
apontar `konta.app` (ou o domínio escolhido) como domínio customizado do
próprio serviço Render (suporta domínios customizados com HTTPS gerido,
confirmado na documentação oficial) — não é preciso nenhum subdomínio
`api.konta.app` separado, porque não há um serviço de API separado: é a
mesma aplicação, um único domínio custom basta.

## 8. Custo

Objetivo: **$0/mês**. Nenhum valor "assumido gratuito" — todos confirmados
nesta tarefa em fontes oficiais.

| Componente | Serviço | Plano | Custo | Limitação confirmada |
|---|---|---|---|---|
| Frontend + API (Next.js completo) | Render | Free Web Service | $0 | 512 MB RAM; spin-down aos 15 min sem tráfego (~1 min para acordar); 750h/mês grátis por workspace; sem cartão exigido |
| Base de dados | Neon | Free | $0 | 0.5 GB de armazenamento; 100 CU-hours de computação/mês; autosuspend aos 5 min de inatividade (dados nunca apagados por isso); sem cartão exigido |
| Repositório/deploy | GitHub + integração Git do Render | Free | $0 | Deploy automático a cada push, sem CI/CD extra a construir |
| HTTPS | Gerido pelo Render (`*.onrender.com`) | Incluído | $0 | Sem domínio próprio ainda — resolvido automaticamente pelo hostname do próprio Render, sem Caddy/Let's Encrypt manual necessário aqui |
| Backup | Manual, `pg_dump` local | — | $0 | Sem automação nesta fase — ver secção "Limitations" |
| Domínio próprio | — | Não comprado | $0 | Documentado como próximo passo opcional, não bloqueia o lançamento |
| Vercel | — | **Não utilizado** | — | Ver secção 3 (termos de uso não-comercial) e secção 7 (justificação arquitetural) |
| Oracle Cloud | — | **Não utilizado nesta fase** | — | Documentação de `docs/operations/ORACLE-CLOUD.md` mantida como opção futura de self-host, não descartada |

## 9. Plano de deployment

*(Detalhado passo a passo em `docs/operations/RENDER-NEON.md`, criado a
seguir a este documento — aqui só o resumo.)*

1. Criar conta Neon (GitHub OAuth, sem cartão) → criar um projeto Postgres
   → copiar a connection string (já vem com `?sslmode=require`).
2. Aplicar o schema (`prisma/manual-sql/0001_init.sql` +
   `0002_seed_categories.sql`) contra essa connection string com `psql`
   (a partir do Windows, ou eu próprio corro a partir daqui se me deres a
   connection string temporariamente).
3. Criar conta Render (GitHub OAuth, sem cartão) → New Web Service →
   ligar ao repositório → escolher "Docker" como runtime (o `Dockerfile`
   já existente é detetado automaticamente).
4. Configurar variáveis de ambiente no painel do Render:
   `DATABASE_URL` (a do Neon), `AUTH_SECRET` (gerado de novo, nunca
   reutilizado), `NODE_ENV=production`.
5. Configurar o Health Check Path do serviço Render como `/api/health`
   (endpoint já existente do Pre-Beta Hardening).
6. Deploy. Confirmar `https://<nome-do-serviço>.onrender.com/api/health`
   devolve 200.
7. Testar o fluxo real: registo, login, criar conta, criar transação —
   confirmar que o cookie de sessão persiste (mesma origem, sem alterações
   nesta área).
8. Estabelecer a rotina de backup manual (periodicidade sugerida:
   semanal, ou antes de qualquer mudança grande).

## 10. O que o proprietário precisa fazer manualmente

1. Criar a conta Neon e o projeto Postgres (2 minutos, sem cartão).
2. Criar a conta Render e o Web Service ligado ao repositório GitHub do
   Konta (sem cartão).
3. Colar os valores gerados (`DATABASE_URL` do Neon, `AUTH_SECRET` novo)
   nas variáveis de ambiente do Render.
4. Confirmar o primeiro deploy e o health check.
5. Guardar a connection string do Neon num sítio seguro (gestor de
   passwords) — é o equivalente ao `.env.production` de antes, nunca deve
   ir para o GitHub.
6. Assumir a rotina de backup manual (ou pedir para eu correr o backup
   periodicamente a partir daqui, contra a connection string do Neon,
   entregando-te o ficheiro `.dump` para guardares).

---

**Nada foi implementado no código da aplicação para chegar a esta análise.**
Os ficheiros de apoio (env de exemplo, `render.yaml`, script de backup
adaptado, documentação) descritos na secção 4 são pequenos e seguros —
implementados a seguir a este documento, conforme autorizado no pedido.
