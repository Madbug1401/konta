# Konta — Decisões de arquitetura (ADR resumido)

Este documento existe por causa da regra 29 do briefing do produto: nenhuma
decisão que afete o modelo de dados, segurança, UX, API, Financial Engine,
compatibilidade mobile ou estratégia de migração deve ser tomada em silêncio.
Cada decisão abaixo referencia o(s) ficheiro(s) onde está implementada e o
`[DECISÃO N]` correspondente nos comentários do código.

## 1–2. Multi-utilizador desde a fundação + timezone como dado de primeira classe

Todas as tabelas relevantes (`Account`, `Transaction`, `Debt`, `Goal`,
`RecurringTransaction`, `Category`) têm `userId` obrigatório. Toda a função em
`src/lib/db/*.ts` recebe `userId` explicitamente e filtra sempre por ele —
nunca por um id vindo do cliente sem cruzar com o utilizador autenticado. O
`User.timezone` (default `Atlantic/Cape_Verde`) é usado por todo o Financial
Engine para "hoje" e limites de período — nunca `new Date().toISOString()`.

Ficheiros: `prisma/schema.prisma` (User, comentário [DECISÃO 1]/[DECISÃO 2]),
`src/lib/financial-engine/datetime.ts`, `src/lib/db/accounts.ts`,
`src/lib/db/transactions.ts`.

## 3. Contas como razão (ledger), não como saldo gravado

Uma `Account` nunca guarda o seu saldo atual num campo. O saldo é sempre
`initialBalanceMinor + Σ(entradas) − Σ(saídas)`, calculado por
`getAccountBalance()`. Isto elimina por construção o bug da auditoria em que
o Cofre de Emergência somava valores absolutos: já não existe "valor com
sinal ambíguo", existe sempre uma direção (`accountId` = saída,
`destinationAccountId` = entrada) determinada pelo `type` da transação.

Ficheiro: `src/lib/financial-engine/balance.ts`. Prova de regressão:
`src/lib/financial-engine/audit-regressions.test.ts` ("Bug 1").

## 4/20. Dinheiro como inteiro em unidade mínima, nunca float

Todos os campos monetários são `BigInt` em Postgres/Prisma (`amountMinor`,
`initialBalanceMinor`, `targetAmountMinor`, etc.) e `bigint` em TypeScript.
CVE não tem subunidade de uso corrente, por isso `minorUnitFactor = 1`; para
suportar EUR/USD no futuro bastaria uma tabela `minorUnitFactor` por moeda em
`src/components/money-display.tsx` e `src/lib/financial-engine/money.ts` — a
escolha de já guardar tudo como inteiro é o que torna essa mudança futura
segura e sem migração de dados.

## 5. Modelo de dados separado (Accounts / Transactions / Categories / Debts / Goals / Recurring / Investments)

Ver `prisma/schema.prisma` — schema completo com comentários `[DECISÃO N]`
por entidade. Resumo das relações:

- `User` 1—N `Account`, `Category`, `Transaction`, `Debt`, `Goal`, `RecurringTransaction`.
- `Transaction` N—1 `Account` (origem, sempre) e opcionalmente N—1 `Account`
  (destino, só quando `type = TRANSFER`).
- `Transaction` opcionalmente liga-se a `Debt`/`DebtInstallment`/`Goal`/`RecurringTransaction`.
- `Debt` 1—N `DebtInstallment` (plano de parcelas com identidade própria).
- `Goal` opcionalmente N—1 `Account` (a conta dedicada cujo saldo é o progresso da meta).
- `Account` (tipo INVESTMENT) 1—1 `InvestmentDetail` 1—N `InvestmentValuation`.

## 6. Transferências nunca são despesas

`TransactionType` inclui `TRANSFER` como um caso de primeira classe, com
`destinationAccountId`. A rota `POST /api/transactions`
(`src/app/api/transactions/route.ts`) valida com Zod que só `TRANSFER` pode
ter `destinationAccountId` e que `TRANSFER` sempre o exige — impossível
"esconder" uma transferência como despesa.

## 7. Categorias independentes da natureza da transação

`Category.kind` é só `INCOME`/`EXPENSE`, sem qualquer acoplamento a tipo de
conta. `TRANSFER` nunca leva categoria (`categoryId = null`, reforçado na
validação da rota). Categorias de sistema (`userId = null`) são seed de
arranque (`prisma/manual-sql/0002_seed_categories.sql`); o utilizador pode
criar as suas via `POST /api/categories`.

## 8/9. Dívidas como entidade própria + plano de parcelas exato

`Debt` guarda `originalAmountMinor`, `interestRate` (`Decimal`, nunca float),
`status`. `DebtInstallment` é o plano de pagamento (sequência, vencimento,
valor, estado), gerado por `generateInstallmentPlan()` /
`splitIntoInstallments()` em `src/lib/financial-engine/`. A divisão é feita
por aritmética inteira exata (divisão inteira + resto distribuído pelas
últimas parcelas) — a soma bate certo **por construção**, nunca por uma
comparação `installment * count === total` em float. Este é o bug mais citado
na auditoria; ver "Bug 2" em `audit-regressions.test.ts`.

A interface de gestão de dívidas (criar dívida, ver plano, marcar parcela
como paga) fica para o próximo milestone — o modelo de dados e o motor de
cálculo já estão prontos e testados; só falta a UI.

## 10. Múltiplas metas em paralelo

`Goal` é uma entidade independente com `targetAmountMinor` e
`linkedAccountId` próprios — nada partilhado globalmente. v1 assume uma conta
dedicada por meta (o progresso = saldo dessa conta); o padrão alternativo
("contribuições marcadas por `goalId` sem conta dedicada", para quem não
quiser criar uma conta por meta) fica documentado aqui como fast-follow, para
não overengineer a v1. A interface de metas também fica para o próximo
milestone, pela mesma razão que dívidas.

## 11/17. Investimentos: capital aportado ≠ valor atual ≠ rentabilidade

Um investimento é uma `Account(type=INVESTMENT)` + `InvestmentDetail` (tipo,
retorno esperado, vencimento) + `InvestmentValuation` (histórico de
avaliações manuais). `computeInvestmentPerformance()`
(`src/lib/financial-engine/investments.ts`) devolve sempre os dois números
separados: `capitalContributedMinor` (soma das transferências de entrada,
nunca inclui juro) e `currentValueMinor` (última avaliação registada). Sem
avaliação, `hasValuation: false` e `returnPercent: null` — a UI mostra "sem
avaliação registada" em vez de inventar uma rentabilidade, corrigindo
diretamente o bug da auditoria. Ver "Bug 4" em `audit-regressions.test.ts`.

## 12. Página de transações completa (não só "próximos eventos")

`src/app/(app)/transactions/page.tsx` lista com paginação, pesquisa
(`ILIKE` na descrição), filtro por conta/categoria/tipo/período, e ações de
editar/remover por linha (`src/components/transaction-row-actions.tsx`),
com as rotas `GET/PATCH/DELETE /api/transactions/[id]`.

## 13/14. Design system + responsive desde o dia 1

`src/components/ui/*` + `src/components/*` (AccountCard, TransactionItem,
MoneyDisplay, EmptyState) formam a base reutilizável. Cores só existem como
variáveis CSS em `src/app/globals.css` (`--color-*`), nunca "hardcoded" num
componente — é isso que torna o tema claro/escuro (`ThemeToggle`) uma troca
de atributo `data-theme`, sem tocar em nenhum componente.

A navegação (`src/components/app-shell.tsx`) é UM único componente que
renderiza sidebar fixa em desktop/tablet (`md:flex`) e barra inferior +
botão flutuante "Nova transação" em mobile (`md:hidden`) a partir da mesma
lista `NAV_ITEMS` — não há duas implementações de navegação a divergir.

## 15. Modelo alvo é Prisma — mas ver "Prisma neste ambiente" abaixo

`prisma/schema.prisma` é a fonte de verdade do modelo de dados e o alvo de
migração. Foi mantido 100% completo mesmo sem poder correr `prisma generate`
neste sandbox (ver secção seguinte).

## Prisma neste ambiente de desenvolvimento

O CLI da Prisma 7.10.0 (versão estável mais recente disponível) falha
qualquer subcomando — incluindo `prisma --help` — com:

```
Error: Failed to fetch sha256 checksum at
https://binaries.prisma.sh/... - 403 Forbidden
```

Confirmámos que não é um erro específico da Prisma (o mesmo domínio devolve
sempre um corpo de 403 idêntico de 76 bytes para qualquer path testado, e
`fonts.googleapis.com` — usado por `next/font/google` — apresenta exatamente
o mesmo comportamento). Isto é a política de rede deste sandbox de
desenvolvimento a bloquear esses domínios especificamente, não um problema no
schema nem no código.

**Impacto**: não foi possível correr `prisma generate` / `prisma migrate dev`
*dentro deste sandbox*. **Mitigação usada para este entregar ser real e
verificável já hoje**:

1. `prisma/schema.prisma` foi escrito por completo e é a fonte de verdade.
2. `prisma/manual-sql/0001_init.sql` é a tradução manual e fiel desse schema
   para SQL puro — aplicada com sucesso a um PostgreSQL 16 local real
   (`psql`), incluindo enums, chaves estrangeiras, índices e um teste de
   inserção (utilizador, contas, transferência) para confirmar que o modelo
   funciona de facto.
3. `src/lib/db/*.ts` usa `pg` (node-postgres) diretamente em vez do Prisma
   Client gerado, com assinaturas de função idênticas às que o Prisma Client
   teria — para que trocar a implementação por `prisma.<model>.findMany(...)`
   mais tarde não exija tocar em mais nenhum ficheiro da aplicação (rotas de
   API, Server Components e o Financial Engine só dependem destas
   assinaturas, nunca do Prisma diretamente).

**Quando abrires este projeto num ambiente com rede normal** (a tua máquina,
GitHub Actions, Vercel): corre `npx prisma generate && npx prisma migrate dev
--name init`. A partir daí, o caminho recomendado é substituir o corpo de
cada função em `src/lib/db/*.ts` para usar o Prisma Client — sem mudar
nenhuma assinatura.

## Autenticação: JWT próprio em vez de NextAuth "padrão"

Ver `src/lib/auth/jwt.ts` para a justificação completa. Resumo: o requisito
explícito é Web e o futuro Mobile consumirem a mesma API (secção 2 do
briefing). Um JWT assinado com `jose`, devolvido por
`POST /api/auth/login`/`register`, pode ser guardado como cookie httpOnly
pela Web e mais tarde em `SecureStore` pelo Expo — a mesma função
`verifySessionToken()` valida ambos. NextAuth foi considerado e posto de
lado por acoplar fortemente o modelo de sessão a cookies de browser; pode ser
reconsiderado no Milestone 7 se fizer mais sentido nessa altura.

## Fontes: sistema em vez de next/font/google

Mesma limitação de rede do sandbox (ver acima) bloqueia
`fonts.googleapis.com`. `src/app/layout.tsx` usa uma pilha de fontes do
sistema. Isto não é uma limitação do produto — é trivial trocar por uma
fonte própria auto-hospedada (`public/fonts/*.woff2` + `@font-face`) quando
fizer sentido, sem depender de rede em build-time.

## Migração dos dados do protótipo (localStorage)

Ver `docs/architecture/MIGRATION.md` para o mapeamento completo
`financeEvents`/`financeSettings` → o novo modelo.

## Saldo não pode incluir o futuro (bug encontrado em uso real, 2026-08-25)

**Sintoma**: ao testar a app corrida localmente, uma transação de receita
datada no mês seguinte (`Salário Estágio IEFP`, +15 000 CVE, data
2026-09-15, registada com "hoje" ainda em 2026-08-25) apareceu já somada ao
saldo da conta e ao "Saldo disponível" do dashboard, antes de essa data
chegar.

**Causa**: `getAccountBalance`/`getNetWorth`/`getAvailableBalance`
(`src/lib/financial-engine/balance.ts`) já aceitavam um parâmetro opcional
`asOfDate` desde o início, precisamente para filtrar transações futuras —
mas era opcional, e nenhuma das páginas/rotas que mostram saldo "atual"
(`dashboard/page.tsx`, `accounts/page.tsx`, `api/accounts/route.ts`,
`financial-engine/goals.ts`) o estava a passar. Sem `asOfDate`, o filtro em
`relevantTransactions` não exclui nada por data — só por `status`.

**Opções consideradas**:
1. Marcar transações futuras com `status = 'PENDING'` em vez de
   `'COMPLETED'` na criação, e deixar o filtro de status existente
   encarregar-se disto.
2. Continuar a criar tudo como `COMPLETED` (é um facto registado, não uma
   previsão) e passar sempre `asOfDate = getTodayInTimezone(timezone)` nos
   sítios que calculam saldo "de agora".

**Decisão**: opção 2. A opção 1 exigiria depois um mecanismo (job/cron) para
"promover" a transação de `PENDING` para `COMPLETED` quando a data chegasse
— exatamente o tipo de infraestrutura que ainda não existe neste projeto
(ver nota sobre materialização de transações recorrentes) e que seria
prematuro introduzir só para isto. A opção 2 usa um mecanismo que já existia
e já estava testado, calculado sempre a partir da hora real do pedido — não
precisa de nenhum passo de manutenção para se manter correta à medida que os
dias passam. `PENDING` continua reservado para o que já representava
(ex: parcelas de dívida ainda não pagas).

**O que mudou**: `dashboard/page.tsx`, `accounts/page.tsx`,
`api/accounts/route.ts` passam agora `today = getTodayInTimezone(timezone)`
a todas as chamadas de saldo; `getGoalProgress` (`financial-engine/goals.ts`)
passou a aceitar e propagar `asOfDate`. Teste de regressão novo em
`balance.test.ts` reproduz exatamente este caso.

## BLOCKER corrigido na auditoria Go-to-Beta (29/08/2026): auto-transferência criava dinheiro

**Sintoma encontrado durante a auditoria** (não em uso real, mas facilmente
acionável por qualquer utilizador autenticado): criar uma TRANSFER com
`accountId === destinationAccountId` (transferir de uma conta para ela
própria) fazia o saldo dessa conta aumentar em `amountMinor`, sem qualquer
dedução correspondente.

**Causa**: `getAccountBalance` (`financial-engine/balance.ts`) calculava
`isIncoming` e `isOutgoing` como dois booleanos independentes, mas aplicava-os
com `if (isIncoming) ...; else if (isOutgoing) ...`. Para a conta envolvida
numa auto-transferência, `isIncoming` (destino) e `isOutgoing` (origem) eram
ambos verdadeiros — mas por ser `else if`, só a soma corria. Nada na API
impedia `accountId === destinationAccountId` de chegar até ali.

**Correção, duas camadas** (defesa principal + defesa em profundidade,
deliberado — nenhuma delas seria suficiente sozinha para todos os casos
futuros):
1. `api/transactions/route.ts` — novo `.refine()` no `CreateTransactionSchema`
   rejeita `accountId === destinationAccountId` com 400 antes de qualquer
   escrita na base de dados. Esta é a defesa principal: uma auto-transferência
   não tem significado real, não há razão para a aceitar.
2. `financial-engine/balance.ts` — `if (isIncoming) ...` e
   `if (isOutgoing) ...` deixaram de ser `if/else if` e passaram a ser dois
   `if` independentes. Para todos os casos que já existiam (INCOME, EXPENSE,
   TRANSFER entre contas diferentes) `isIncoming`/`isOutgoing` nunca eram
   ambos verdadeiros ao mesmo tempo, por isso esta mudança não altera nenhum
   resultado já coberto pelos testes existentes — só passa a dar o resultado
   certo (efeito líquido zero) se algum dia um registo de auto-transferência
   chegar ao motor de cálculo por outro caminho que não a API (um dado
   antigo, uma migração, um script). O Financial Engine é a fonte de verdade
   partilhada por Web/Mobile/relatórios/futura IA — não deve depender só da
   validação de um formulário para se manter correto.

**Relacionado, corrigido na mesma passagem**: os schemas Zod de
`amountMinor` (criação e edição de transação) e `initialBalanceMinor`
(criação de conta) não tinham limite superior. Um número JS "inteiro" mas
acima de `Number.MAX_SAFE_INTEGER` já perde precisão no `JSON.parse` antes
de o Zod o validar, e um valor ainda maior rebenta o `BIGINT` do Postgres a
meio do `INSERT` (erro não tratado). Adicionado `.max(Number.MAX_SAFE_INTEGER)`
— um limite técnico de precisão, não uma regra de negócio sobre "quanto
dinheiro alguém pode ter" (essa decisão não é minha para tomar aqui).

Teste de regressão novo em `balance.test.ts` ("bug crítico encontrado em
auditoria Go-to-Beta") reproduz exatamente o cenário de auto-transferência.

## Hosting de produção: VPS + Docker Compose, não plataforma gerida (Pre-Beta Hardening, 29/08/2026)

**Sintoma**: `GO_TO_BETA_AUDIT.md` (achado 6.1) — sem Dockerfile, sem
`output: "standalone"`, sem processo de deploy documentado, sem backups
reais (achado 5.7). Duas perguntas que não podiam ser respondidas em
silêncio: onde é que isto corre, e onde ficam os backups.

**Decisão**: um único VPS (qualquer fornecedor com Docker + disco
persistente — Hetzner/DigitalOcean/Linode servem igualmente; a escolha do
fornecedor concreto é operacional) a correr `docker-compose.prod.yml`
(Postgres + a app, construída pelo `Dockerfile` novo) e
`scripts/backup/backup.sh` num cron diário, com cópia externa opcional via
`rclone`. Ver `docs/architecture/DEPLOYMENT.md` e
`docs/architecture/BACKUP.md` para o raciocínio completo e o procedimento.

**Porque não uma plataforma gerida (Vercel + Postgres gerido) já agora**:
a Prioridade 1 exige backups reais e **verificáveis por nós** — direto de
garantir quando controlamos o Postgres, difícil de auditar de fora com um
serviço gerido de terceiros. Um servidor único e o `docker-compose.yml`
já validado localmente pelo utilizador (`WINDOWS_SETUP.md`) evita também
duplicar operação (duas contas, duas faturas) para uma aplicação pequena.
Não é uma rejeição definitiva — só não faz sentido para 10–30 utilizadores;
ver critérios de reconsideração em `DEPLOYMENT.md`.

**O que mudou**: `next.config.ts` (`output: "standalone"`, confirmado com
`npm run build` real — gera `.next/standalone/server.js`, testado a correr
e a responder HTTP 200), `Dockerfile` novo (multi-stage, utilizador não-root
na imagem final), `.dockerignore` novo, `docker-compose.prod.yml` novo
(serviço `app` + `db`, sem publicar a porta do Postgres),
`.env.production.example` novo, `scripts/backup/{backup,restore,verify-backup}.sh`
novos (testados de facto contra um Postgres 16 real com o schema do Konta —
ciclo completo dump → restauro para base de dados de verificação → limpeza
automática, e um segundo teste confirmando que `restore.sh` substitui
corretamente dados existentes), e `.gitignore` corrigido para os `*.example`
deixarem de ser apanhados pela regra `.env*` (sem isto, um checkout novo do
repositório nem tinha o modelo de onde copiar as variáveis).

**Limitação honesta**: não foi possível correr `docker build`/`docker pull`
dentro deste sandbox de desenvolvimento — o registo `docker.io` (e também
`gcr.io`, `public.ecr.aws`) está bloqueado pela mesma política de rede que
já impede `binaries.prisma.sh`/`fonts.googleapis.com` (ver secção "Prisma
neste ambiente" acima). O `Dockerfile` segue o padrão oficial da Next.js
para `output: "standalone"` e o resultado do build (`.next/standalone`) foi
verificado a correr de facto; falta só confirmar o `docker build` completo
numa máquina com acesso normal ao Docker Hub — primeiro passo a fazer no
VPS real, não um risco novo desta tarefa.

**Ainda em aberto, documentado explicitamente em vez de ignorado**: HTTPS.
`process.env.NODE_ENV === "production"` já liga o cookie de sessão como
`secure` (`src/app/api/auth/login/route.ts`/`register/route.ts`) — em
produção sem TLS à frente da app, ninguém consegue manter sessão iniciada.
Não implementado nesta tarefa (é infraestrutura nova, não hardening do que
já existe); documentado em `DEPLOYMENT.md` como pré-requisito de
lançamento e repetido no `BETA_GATE` final.

## Erro de ligação à base de dados não pode derrubar o processo (Pre-Beta Hardening, Prioridade 2, 29/08/2026)

**Sintoma** (`GO_TO_BETA_AUDIT.md`, achado 5.3): `src/lib/db/client.ts`
criava o `pg.Pool` sem nenhum listener `'error'`. `pg.Pool` é um
`EventEmitter`; quando um cliente ocioso da pool perde a ligação ao Postgres
(rede instável, o Postgres reiniciou, uma ligação cortada por um firewall),
o driver emite `'error'` nesse Pool. O comportamento por omissão do Node
para um evento `'error'` sem listener é lançar essa exceção como não
tratada — o que derruba o processo Next.js inteiro, para todos os pedidos
em curso, por causa de uma única ligação ociosa que falhou.

**Decisão**: registar `pool.on("error", ...)` assim que a pool é criada,
chamando `logError("db.pool", err)` (novo `src/lib/logger.ts`, ver
Prioridade 5). Não silencia o erro (perderíamos visibilidade de problemas
reais de rede/base de dados) nem volta a lançá-lo (reproduziria o crash). O
`pg` já substitui internamente o cliente com falha por um novo na próxima
ligação pedida à pool — não é preciso gerir isso manualmente.

**O que mudou**: `src/lib/db/client.ts` (`pool.on("error", ...)`),
`src/lib/logger.ts` novo (módulo de logging mínimo partilhado — introduzido
já aqui, embora a Prioridade 5 completa venha no grupo seguinte, para o
`pool.on("error")` já ter algo real a chamar em vez de um `console.error`
avulso que teria de ser reescrito depois).

**Teste de regressão**: `src/lib/db/client.test.ts` — obtém a pool via
`getPool()`, emite `pool.emit("error", new Error(...))` diretamente (o mesmo
evento que o driver `pg` emitiria), e confirma duas coisas: (1)
`expect(() => pool.emit(...)).not.toThrow()` — antes da correção, isto teria
lançado a exceção não tratada; (2) `logError` foi mesmo chamado com o erro —
o erro não desaparece silenciosamente.

## Rate limiting em login/registo: em memória, sem CAPTCHA (Pre-Beta Hardening, Prioridade 3, 29/08/2026)

**Sintoma**: `GO_TO_BETA_AUDIT.md` — `POST /api/auth/login` e
`POST /api/auth/register` não tinham nenhum limite de tentativas, abertos a
força bruta e a registo em massa.

**Decisão**: `src/lib/rate-limit.ts` — um limitador por janela fixa,
guardado num `Map` em memória do próprio processo, chaveado por
`"<rota>:<ip>"`. Sem nenhuma dependência nova (nada de Redis) e sem CAPTCHA,
por pedido explícito do utilizador ("a Beta vai ter poucos utilizadores").
Limites escolhidos: login 10 tentativas/15 min por IP (permissivo o
suficiente para um utilizador legítimo que erra a password), registo 5/hora
por IP (mais apertado — criar conta é raro para um utilizador legítimo e é o
alvo mais atrativo para um bot). Resposta ao exceder: `429` com
`Retry-After` em segundos.

**Limitação conhecida, documentada e não escondida**: isto só funciona
corretamente numa única instância do processo (perde a contagem num
restart; não é partilhado entre instâncias atrás de um load balancer). É
consistente com a decisão de hosting desta fase — um único VPS, uma única
instância (ver `DEPLOYMENT.md`) — e passa a precisar de revisão (ex: mover
para um store partilhado) só se/quando isso mudar.

**O IP do pedido** vem de `x-forwarded-for`/`x-real-ip` (`getClientIp()`) —
cabeçalhos que só existem de facto quando a app corre atrás de um proxy
reverso, que é já um pré-requisito de produção por causa do HTTPS (ver
decisão de hosting acima). Sem esses cabeçalhos, todos os pedidos caem em
`"unknown"`, o que é mais restritivo (todos partilham a mesma contagem),
nunca mais permissivo.

**Testes**: `src/lib/rate-limit.test.ts` — permite até ao limite, bloqueia
a partir daí com `retryAfterSeconds > 0`, volta a permitir depois de a
janela expirar, mantém contagens independentes por IP e por rota; mais
`getClientIp()` para os três casos (`x-forwarded-for`, `x-real-ip`,
nenhum). `checkRateLimit` aceita um `now` opcional exatamente para estes
testes não dependerem de tempo real/`setTimeout`.

## Tratamento de erros uniforme nas rotas de API + error boundaries (Pre-Beta Hardening, Prioridade 4, 29/08/2026)

**Sintoma** (`GO_TO_BETA_AUDIT.md`, achados 5.4/5.5): nenhuma das 8 rotas de
API tinha `try/catch` — uma falha inesperada (ex: base de dados em baixo)
propagava-se como exceção não tratada; a Web não tinha `error.tsx`, por isso
um erro de renderização mostrava a página de erro genérica do Next.js.

**Decisão**: em vez de repetir `try/catch` em cada rota (risco de esquecer
uma, ou de cada uma responder de forma ligeiramente diferente),
`src/lib/api-error.ts` exporta `withErrorHandling(context, handler)` — um
wrapper único aplicado às 8 rotas (`accounts`, `auth/{login,register,
logout,me}`, `categories`, `transactions`, `transactions/[id]`). Qualquer
exceção não apanhada é registada com `logError(context, error)` (nunca
silenciada) e transformada sempre na mesma resposta segura: `500 { error:
"Algo correu mal. Tenta novamente." }` — texto exigido explicitamente pelo
utilizador, nunca a mensagem técnica nem o stack trace. `NotFoundError` é um
atalho para rotas sinalizarem "não encontrado" só com `throw`, sem obrigar
a reescrever as verificações manuais já existentes (`if (!x) return
NextResponse.json(...)`), que continuam a funcionar sem alterações.

Do lado da Web: `src/app/error.tsx` (apanha erros de renderização de
qualquer página) e `src/app/global-error.tsx` (só para o caso extremo do
próprio `layout.tsx` raiz falhar — tem de renderizar o seu próprio
`<html>/<body>`, por exigência do Next.js). Ambos mostram exatamente "Algo
correu mal. Tenta novamente." e registam o erro técnico (`logError`) antes
de mais nada.

**Verificado de facto, não só por inspeção de código**: build de produção
(`.next/standalone`) arrancado com um `DATABASE_URL` deliberadamente
inválido (porta sem nada a ouvir), pedido real a `GET /api/categories` com
um JWT válido — resposta ao cliente foi `500 {"error":"Algo correu mal.
Tenta novamente."}`, e o log do servidor mostrou a linha JSON completa do
`logError` (`context: "api.categories.get"`, `message: "connect
ECONNREFUSED ..."`, `code: "ECONNREFUSED"`) seguida do stack trace real —
confirma as duas exigências ao mesmo tempo: nada vaza para o cliente, nada
desaparece do log do servidor.

**Testes**: `src/lib/api-error.test.ts` — uma resposta normal passa sem
alterações; um `NotFoundError` vira `404` com a sua mensagem; um erro
inesperado não rebenta para fora do handler (`resolves.toBeInstanceOf
(Response)`, nunca lança); a mensagem técnica nunca aparece na resposta
(`JSON.stringify(body)` não contém o texto original do erro) mas
`logError` é mesmo chamado com o erro completo.

## Health check (Pre-Beta Hardening, Prioridade 6, 29/08/2026)

**Sintoma** (`GO_TO_BETA_AUDIT.md`, achado 5.6): não havia forma de saber
que a app tinha caído sem um utilizador reportar.

**Decisão**: `GET /api/health` (`src/app/api/health/route.ts`) — sem
autenticação (um healthcheck de infraestrutura não tem sessão de
utilizador) e sem devolver nenhum dado sensível. Verifica as duas coisas
mínimas exigidas: o processo está a responder (só por chegar à rota, já
está) e a base de dados está acessível (`SELECT 1` real através da mesma
`getPool()` de `src/lib/db/client.ts` — não assumido). `200 {"status":
"healthy"}` quando a query passa; `503 {"status": "unhealthy"}` quando
falha, com o erro técnico registado via `logError` (nunca silenciado, nunca
exposto na resposta). `docker-compose.prod.yml` (Prioridade 12) já usa este
endpoint no `healthcheck:` do serviço `app`.

**Verificado de facto**: build de produção arrancado duas vezes — uma
ligada ao Postgres real (`200 {"status":"healthy"}`) e outra com
`DATABASE_URL` deliberadamente inválido (`503 {"status":"unhealthy"}`, com
o `ECONNREFUSED` completo no log do servidor e nada na resposta HTTP).

**Testes**: `src/app/api/health/route.test.ts` — `getPool` mockado para
devolver sucesso (`200`/`healthy`) e falha (`503`/`unhealthy`, confirmando
que o IP/porto do erro simulado não aparece na resposta).

## Ownership de categoryId (Pre-Beta Hardening, Prioridade 7, 29/08/2026)

**Sintoma** (`GO_TO_BETA_AUDIT.md`): `accountId`/`destinationAccountId`
já eram validados contra o utilizador autenticado (`getAccountById`), mas
`categoryId` não — `createTransaction`/`updateTransaction` aceitavam
qualquer id de categoria que existisse na base de dados, incluindo uma
categoria privada de outro utilizador. Um utilizador conseguia "etiquetar"
as próprias transações com a categoria privada de outra pessoa (BOLA —
Broken Object Level Authorization).

**Decisão**: `getCategoryById(userId, categoryId)` novo em
`src/lib/db/categories.ts`, espelhando exatamente o princípio já usado em
`getAccountById` — só devolve a categoria se for de sistema (`userId IS
NULL`, partilhada) ou pertencer a este utilizador; caso contrário devolve
`null`. Chamado em `POST /api/transactions` e `PATCH
/api/transactions/[id]` sempre que um `categoryId` é fornecido, antes de
persistir — `404 { error: "Categoria não encontrada." }` se a categoria não
for visível para este utilizador (mesma mensagem/padrão já usado para
`accountId` inválido).

**Verificado de facto contra uma base de dados real** (não só com mocks):
criada uma categoria privada para um utilizador, tentativa de a usar
autenticado como outro utilizador → `404 {"error":"Categoria não
encontrada."}`, zero linhas escritas em `Transaction` (confirmado por
`SELECT count(*)`); o mesmo pedido com uma categoria do próprio utilizador
→ `201`, transação criada corretamente.

**Testes**: `src/app/api/transactions/route.test.ts` (POST) e
`src/app/api/transactions/[id]/route.test.ts` (PATCH) — rejeita uma
categoria de outro utilizador sem chamar `createTransaction`/
`updateTransaction`; aceita uma categoria de sistema ou própria; não chama
`getCategoryById` quando a transação não envolve `categoryId` (ex:
TRANSFER, ou um PATCH que não altera a categoria).

## Validação de limit/offset em GET /api/transactions (Pre-Beta Hardening, Prioridade 8, 29/08/2026)

**Sintoma**: `limit`/`offset` da query string eram convertidos com
`Number(...)` sem nenhuma validação — `?limit=abc` produzia `NaN`, um
`offset` negativo ou um `limit` astronomicamente grande seguiam direto para
`listTransactions()` e chegavam ao Postgres como parâmetros de
`LIMIT`/`OFFSET`. Na prática isto virava um `500` genérico (o Postgres
rejeita `NaN`/negativo, e a exceção não era tratada antes da Prioridade 4)
em vez de um `400` claro, e um `limit` sem limite superior era uma via
aberta para pedir um número absurdo de linhas de uma vez.

**Decisão**: `src/lib/pagination.ts` — `parsePagination(rawLimit,
rawOffset)`, uma função pura (fácil de testar sem HTTP): `limit` tem de ser
um inteiro entre 1 e 200, `offset` entre 0 e 1 000 000; qualquer valor fora
disto (incluindo `NaN`, decimais, `Infinity`) é rejeitado com uma mensagem
específica. `GET /api/transactions` chama-a antes de tocar na base de
dados e devolve `400` se falhar — `listTransactions` nunca chega a correr
com um valor inválido.

**Verificado de facto contra uma base de dados real**: `?limit=abc` → `400`
com mensagem clara (antes: seria um erro do Postgres não tratado);
`?offset=-1` → `400`; `?limit=99999999` → `400`; `?limit=5&offset=0` → `200`
normal.

**Testes**: `src/lib/pagination.test.ts` (11 casos — valores por omissão,
válidos, `NaN`, negativos, acima do máximo, decimais, `Infinity`) e três
testes de rota em `src/app/api/transactions/route.test.ts` confirmando que
`listTransactions` nunca é chamado com paginação inválida.

## Normalização de email (Pre-Beta Hardening, Prioridade 9, 29/08/2026)

**Sintoma**: `email = $1` no Postgres é sensível a maiúsculas/minúsculas
por omissão. `"Test@Example.com"` e `"test@example.com"` eram tratados como
contas diferentes — tanto na comparação (`findUserByEmail`) como na
unicidade (a própria constraint `UNIQUE` da coluna `email`) — permitindo
duas contas para o mesmo endereço, e um utilizador a "perder" o acesso à
sua conta só por escrever o email com uma capitalização diferente da usada
no registo.

**Decisão**: `normalizeEmail(email) = email.trim().toLowerCase()`, novo em
`src/lib/db/users.ts`, aplicado dentro de `findUserByEmail` e `createUser`
— um único sítio, não em cada rota que os chama (`login`, `register`, e
qualquer futuro consumidor). Não foram alteradas outras regras de
autenticação (comprimento mínimo da password, mensagens de erro, etc.),
por pedido explícito do utilizador.

**Limitação aceite, não migrada agora**: isto normaliza escrita e leitura
a partir de agora; não reescreve retroativamente emails já gravados com
maiúsculas (nenhum existia nos dados de desenvolvimento atuais). Se algum
dia isso importar, é uma migração de dados de uma linha (`UPDATE "User" SET
email = lower(email)`), não uma mudança de arquitetura — não fazer isso
agora evita tocar em dados de produção sem necessidade.

**Verificado de facto contra uma base de dados real**: registo com
`CaseTest@Example.COM` → conta gravada como `casetest@example.com`; login
imediato a seguir com `casetest@example.com` (minúsculas) → sucesso, mesma
conta; nova tentativa de registo com `CASETEST@EXAMPLE.COM` → `409`
("Não foi possível criar a conta.") — confirma que é reconhecida como a
mesma conta, não uma duplicada.

**Testes**: `src/lib/db/users.test.ts` — `normalizeEmail` isolado (mistura
de maiúsculas, espaços à volta, já em minúsculas); `findUserByEmail`
consulta sempre com o valor normalizado independentemente da capitalização
recebida; `createUser` grava sempre o valor normalizado.

## Correções pequenas de UX (Pre-Beta Hardening, Prioridade 11, 29/08/2026)

Três correções pontuais, sem nenhum redesign — por pedido explícito do
utilizador ("A UI atual está boa").

1. **EmptyState sem contas, sem ação**: `src/app/(app)/accounts/page.tsx`,
   `.../dashboard/page.tsx` e `.../transactions/new/page.tsx` mostravam
   "ainda não tens contas" sem nenhuma forma de agir a partir dali (a
   página `dashboard` nem tinha botão de criar conta nenhures, e
   `transactions/new` só dizia "vai à página Contas", sem link). As três
   passam a receber `action={<AccountForm />}` no `EmptyState` (prop que já
   existia no componente, só não estava a ser usada) — o mesmo componente
   já usado no cabeçalho de `accounts/page.tsx`, reaproveitado, não um
   componente novo. Em `transactions/new`, criar a conta ali mesmo funciona
   porque `AccountForm` chama `router.refresh()` no fim, que faz este
   Server Component voltar a carregar `accounts` — o formulário de
   transação aparece a seguir sem sair da página.

2. **Labels em falta**: `src/app/(app)/transactions/page.tsx` (barra de
   filtros) e `src/components/account-form.tsx` só tinham
   `placeholder`/nenhum texto — sem nome acessível para leitores de ecrã, e
   o placeholder desaparece ao escrever. Na barra de filtros (layout denso
   em grelha) usaram-se labels `sr-only` — corrige a falta de nome
   acessível sem alterar nada visualmente. Em `account-form.tsx`
   (formulário vertical simples) usou-se o mesmo padrão visual **já
   existente** em `transaction-form.tsx` (`<label
   className="text-xs font-medium text-muted-foreground">Texto<Input
   .../></label>`) — não é um estilo novo, é aplicar o que já existe
   noutro formulário da mesma app.

3. **Alvo de toque pequeno**: `src/components/transaction-row-actions.tsx`
   — os botões de editar/remover eram `h-9 w-9` (36×36px), abaixo do
   mínimo recomendado (~44px), especialmente numa linha de tabela densa em
   mobile. Alterado para `h-11 w-11` (44×44px) — só o tamanho da área
   clicável, ícone/cor/espaçamento entre os dois botões inalterados.

**Verificado de facto com screenshots reais** (não só lido o código): app
completa construída e corrida (`node .next/standalone/server.js`, com
`.next/static` copiado manualmente — o mesmo passo que o `Dockerfile` já
fazia, confirmando outra vez porque é necessário), autenticada via API
direta (evita depender da hidratação do formulário de login só para uma
verificação visual) — confirmado visualmente: as três páginas mostram
"+ Nova conta" dentro da própria área vazia; a barra de filtros de
transações mantém exatamente o layout compacto atual (os labels `sr-only`
não mudam nada visível); os botões de editar/remover têm uma área
claramente maior sem a lista ficar desproporcional.

## Política de eliminação de dados documentada, nenhuma funcionalidade de delete implementada (Pre-Beta Hardening, Prioridade 10, 29/08/2026)

O `GO_TO_BETA_AUDIT.md` identificou `Transaction.accountId REFERENCES
"Account"(id) ON DELETE CASCADE` como um risco: apagar uma `Account`
apagaria em cascata todas as `Transaction`s associadas, destruindo
histórico financeiro. Por pedido explícito do utilizador, esta tarefa foi
**apenas de documentação e decisão** — nenhuma rota de delete, componente
de UI ou migração de schema foi implementada.

Levantamento completo de todas as chaves estrangeiras do schema
(`prisma/manual-sql/0001_init.sql`) confirmou que `Transaction.accountId`
é a única relação de `Transaction` com `ON DELETE CASCADE`; todas as
outras (`destinationAccountId`, `categoryId`, `debtId`,
`debtInstallmentId`, `goalId`, `recurringTransactionId`) não têm ação
explícita, o que em Postgres significa `NO ACTION` — o `DELETE` é recusado
enquanto existirem transações a referenciar a linha-alvo, em vez de
apagar ou corromper dados. `Transaction.accountId` é a exceção perigosa,
e também inconsistente consigo própria: apagar a conta de origem de uma
transferência apaga a transação inteira; apagar a conta de destino da
mesma transação seria bloqueado pelo Postgres.

Decisão registada em `docs/architecture/DELETE_POLICY.md`: quando a
funcionalidade de "eliminar conta" for construída (fora do âmbito desta
Beta), deve usar o campo `Account.isArchived` que **já existe no schema
mas nunca foi usado por nenhuma rota ou componente** — soft-delete via
arquivamento, nunca `DELETE FROM "Account"` físico. Recomenda-se também,
nessa altura, migrar `Transaction.accountId` de `CASCADE` para
`RESTRICT`/`NO ACTION`, como proteção adicional ao nível da própria base
de dados contra um hard-delete acidental — não feito agora porque não há
hoje nenhuma funcionalidade que dependa disso, e a migração de schema deve
acontecer junto da funcionalidade que a testa, não isolada.

## Hosting concretizado: Oracle Cloud Always Free, Ampere A1 ARM64 (Preparação de deploy $0, 29/08/2026)

**Sintoma/pedido**: a decisão de hosting anterior ("Hosting de produção: VPS
+ Docker Compose, não plataforma gerida", acima) deixou o fornecedor
concreto em aberto de propósito ("qualquer fornecedor... a escolha exata é
operacional"). O utilizador definiu entretanto uma restrição dura: orçamento
atual = $0, sem VPS pago, sem domínio pago, sem serviços cloud pagos.

**Decisão**: Oracle Cloud Infrastructure, camada Always Free, uma VM Ampere
A1 (ARM64) — não uma das duas alternativas x86 Always Free
(`VM.Standard.E2.1.Micro`, 1/8 OCPU e 1 GB RAM cada), porque 1 GB de RAM é
apertado para Postgres + Next.js + Caddy em simultâneo. Confirmado por
pesquisa nesta tarefa (não por memória/suposição): a alocação Always Free
do Ampere A1 foi **reduzida pela Oracle em 15/06/2026**, de 4 OCPU/24 GB
para **2 OCPU/12 GB** (1.500 horas-OCPU e 9.000 horas-GB por mês) — a conta
Oracle criada agora fica sujeita ao valor novo, não ao antigo. Ainda assim,
2 OCPU/12 GB é largamente suficiente para 10–30 utilizadores (ver
`docs/operations/ORACLE-CLOUD.md`, secção "Capacidade").

**O que mudou**: `docker-compose.prod.yml` ganhou um terceiro serviço
(`caddy`, ver decisão seguinte) e o serviço `app` deixou de publicar a porta
3000 diretamente (só acessível pelo Caddy, via rede interna). `Caddyfile`
novo. `.env.production.example` ganhou `SITE_ADDRESS`.
`docs/architecture/DEPLOYMENT.md` atualizado (hosting concretizado, secção
nova de compatibilidade ARM64, secção de HTTPS resolvida). `BACKUP.md`
atualizado (Oracle Object Storage como destino externo concreto, em vez de
"Backblaze B2 ou equivalente" genérico). Dois documentos novos:
`docs/operations/ORACLE-CLOUD.md` (guia passo a passo) e
`docs/operations/PRODUCTION-RUNBOOK.md` (operações do dia-a-dia).

**O que NÃO mudou**: nenhuma linha de `src/`, nenhuma dependência nova no
`package.json`, nenhuma alteração ao `Financial Engine`, nenhuma
funcionalidade de produto. Esta tarefa é exclusivamente de infraestrutura,
por pedido explícito ("Não implementar Dívidas/Metas/IA/...; não fazer
redesign; não reescrever a aplicação").

## ARM64: confirmado por inspeção e pesquisa, não testado por execução (Preparação de deploy $0, 29/08/2026)

**Sintoma**: a VM Always Free escolhida acima é ARM64, não x86 — era preciso
confirmar que a imagem Docker do Konta (`node:22-alpine` + `next build`)
funciona nessa arquitetura, sem inventar essa confirmação.

**Verificado (CONFIRMADO, por leitura direta do `package-lock.json` deste
repositório)**: `@next/swc-linux-arm64-musl`, `@tailwindcss/oxide-linux-arm64-musl`,
`lightningcss-linux-arm64-musl` e `@img/sharp-linuxmusl-arm64` — todas as
dependências com binários nativos por plataforma usadas no build publicam
variante ARM64/musl (Alpine usa musl, não glibc). `@prisma/client`/`prisma`
(não usados em runtime) não têm nenhum `postinstall` que descarregue
binários — o único script do pacote `prisma` que corre na instalação só
verifica a versão do Node, confirmado por leitura direta desse script.

**Verificado (CONFIRMADO, por pesquisa nesta tarefa)**: as imagens oficiais
`node:22-alpine`, `postgres:16` e `caddy:2-alpine` publicam manifestos
multi-arquitetura com `arm64v8`, confirmado nas páginas oficiais de cada
imagem no Docker Hub.

**Tentado e não conseguido (NÃO TESTADO — DEPENDE DA ORACLE CLOUD, honesto
em vez de fingido)**: o daemon Docker foi arrancado de propósito neste
sandbox para tentar `docker buildx build --platform linux/arm64` a sério.
Todos os registos de imagens testados (`docker.io`, `gcr.io`,
`public.ecr.aws`, `ghcr.io`, `quay.io`, `registry.k8s.io`,
`mcr.microsoft.com`) devolveram bloqueio de rede (`403 Forbidden`/
`connect_rejected`) da política deste ambiente de desenvolvimento — a mesma
classe de restrição já documentada para o Prisma. Não foi possível, por
isso, correr um build ARM64 real. O que foi verificado por execução real
neste sandbox foi só a validação de sintaxe/semântica do
`docker-compose.prod.yml` (`docker compose config`), que não depende de
nenhum registo de imagens.

**Conclusão**: nenhuma incompatibilidade ARM64 foi encontrada nem havia
motivo para alterar o `Dockerfile`. A confirmação final por execução real só
pode acontecer no primeiro `docker compose ... up --build` feito na própria
VM Oracle — documentado como o primeiro passo do procedimento em
`ORACLE-CLOUD.md`, não como risco novo introduzido por esta tarefa.

## Reverse proxy: Caddy em vez de Nginx (Preparação de deploy $0, 29/08/2026)

**Sintoma**: `DEPLOYMENT.md` já tinha identificado que HTTPS era um
pré-requisito de lançamento (o cookie de sessão só é aceite pelo browser com
`secure` sobre HTTPS) mas tinha deixado a escolha de proxy em aberto
("Caddy ou Nginx + Certbot"). Com o requisito adicional de orçamento $0 e
**sem domínio próprio ainda**, a escolha deixa de ser indiferente.

**Decisão**: Caddy (`caddy:2-alpine`), não Nginx+Certbot. Um único critério
decidiu isto, não preferência: Caddy obtém e renova certificados HTTPS
automaticamente a partir de uma única linha de configuração (o hostname em
`Caddyfile`), incluindo para hostnames sslip.io (ver decisão seguinte) — e
quando um domínio real existir mais tarde, a transição é trocar um valor de
variável de ambiente (`SITE_ADDRESS`), sem tocar em mais nada. Nginx exigiria
Certbot como peça separada, com o próprio script de renovação e hook de
reload — mais peças móveis para manter, sem nenhum benefício concreto para
esta Beta pequena (nem Nginx nem Caddy introduzem risco de segurança um
para o outro nesta escala).

**O que mudou**: `docker-compose.prod.yml` ganhou o serviço `caddy`
(único exposto a 80/443); `app` deixou de publicar a porta 3000
diretamente. `Caddyfile` novo, com `reverse_proxy app:3000` e cabeçalhos de
segurança básicos (`X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`) — nada que precise de ser mantido manualmente.

## HTTPS sem domínio próprio: hostname sslip.io (Preparação de deploy $0, 29/08/2026)

**Sintoma**: orçamento $0 significa não comprar um domínio agora — mas
HTTPS continua a ser um requisito funcional (não só de segurança) desta
aplicação, porque o cookie de sessão em produção é `secure`. Let's Encrypt
(usado pelo Caddy) exige um hostname público real para validar um
certificado — não aceita emitir para um IP nu.

**Decisão**: usar um hostname `sslip.io` derivado do IP público da VM (ex.
`203-0-113-10.sslip.io` para o IP `203.0.113.10`). Confirmado por pesquisa
nesta tarefa: sslip.io é um serviço de DNS gratuito e público que resolve
esse hostname para o próprio IP embutido no nome, e o próprio serviço
confirma que isto é suficiente para o Let's Encrypt validar via desafio
HTTP-01 e emitir um certificado real — não um workaround inseguro, é uma
técnica estabelecida e amplamente documentada para exatamente este cenário
("tenho um IP público, ainda não tenho domínio"). Único valor que muda entre
"sem domínio" e "com domínio real, mais tarde": a variável `SITE_ADDRESS`.

**Limitações aceites, documentadas**: sslip.io é um serviço de terceiros
fora do controlo do projeto (se ficar indisponível, a resolução DNS desse
hostname falha até voltar); Let's Encrypt tem limites de taxa por hostname
(não relevante à escala de uma única VM/uma Beta pequena); sslip.io não
suporta certificados wildcard (irrelevante aqui, só é usado um hostname).
Nenhuma destas limitações impede o lançamento da Beta — todas são aceitáveis
para $0 de orçamento, e a transição para um domínio próprio remove-as por
completo sem exigir nenhuma mudança de código ou de arquitetura.

## Oracle Cloud pausada; deploy ZERO-COST via Render + Neon (29/08/2026)

**Sintoma**: a criação da conta Oracle Cloud ficou bloqueada numa
verificação temporária de cartão que não foi possível concluir. O
utilizador definiu um novo objetivo com prazo (utilizadores reais antes de
~15/09/2026) e pediu para não esperar pela Oracle — encontrar o caminho
$0 mais simples com os serviços já sugeridos (Vercel/Render/Neon),
preservando a app tal como está.

**Decisão**: **Render (um único Web Service Free, Docker, a correr a
aplicação Next.js completa tal como já corre hoje) + Neon (Postgres Free)
— sem usar a Vercel.** Análise completa em
`docs/ZERO_COST_DEPLOYMENT_AUDIT.md`; resumo do porquê de não seguir o
diagrama original (Vercel para o frontend, Render para a API):

1. **Este projeto não é um frontend separado de uma API** — confirmado por
   leitura direta do código: os Server Components (`dashboard/page.tsx`,
   `accounts/page.tsx`, etc.) chamam `src/lib/db/*.ts` **diretamente**,
   nunca fazem `fetch` a uma API interna. `getSessionUser()` lê o cookie de
   sessão e verifica o JWT **no mesmo processo** que renderiza a página.
   Só as mutações feitas por Client Components usam `fetch()` — sempre com
   **URLs relativas** (`/api/...`), confirmado por grep em todo o `src/`.
   Separar "frontend" (Vercel) de "API" (Render) exigiria ou dar acesso
   direto à base de dados a partir da Vercel (dissolvendo a separação) ou
   reescrever cada Server Component para passar a fazer `fetch` remoto —
   uma reescrita real, fora do pedido explícito.
2. **O cookie de sessão é `sameSite: "lax"`**, sem `domain` definido —
   funciona perfeitamente em mesma origem (como é usado há sempre), mas
   **não seria enviado** em `fetch` entre `vercel.app` e `onrender.com`.
   Corrigir isso exigiria `sameSite: "none"` + CORS explícito com
   `Access-Control-Allow-Credentials` em todas as rotas de mutação — o tipo
   de alteração de segurança que o pedido explicitamente pediu para evitar
   ("não fazer uma alteração insegura só para fazer funcionar").
3. **A Vercel tem o seu próprio pipeline de build para Next.js e ignora o
   `Dockerfile` deste repositório** — cada rota de API passaria a correr
   como Vercel Serverless Function. Não é uma reescrita, mas é, de facto,
   tornar o backend serverless — contra o pedido explícito.
4. **A Vercel Hobby restringe a uso não-comercial/pessoal** — confirmado
   por pesquisa nesta tarefa, diretamente na documentação oficial da
   Vercel (`vercel.com/docs/plans/hobby`, atualizada em 11/08/2026): "the
   Hobby plan restricts users to non-commercial, personal use only". Mais
   um motivo concreto para não a usar aqui.
5. **O Render, a correr a app inteira a partir do `Dockerfile` já
   existente (o mesmo preparado para a Oracle), não exige nenhuma
   alteração de código** — mantém o processo persistente (não serverless),
   mantém as URLs relativas e o cookie `sameSite: "lax"` exatamente como
   estão.

**Confirmado por pesquisa nesta tarefa, fontes oficiais**: Render Free Web
Service não exige cartão de crédito (`render.com/docs/free`: sem cartão,
ultrapassar limites só suspende o serviço, nunca cobra); Render Free
Postgres expira 30 dias após criação (por isso não é usado — o Postgres é
inteiramente Neon); Neon Free não exige cartão e nunca apaga dados por
inatividade (só o compute entra em autosuspend ao fim de 5 min, os dados
persistem — "None of these limits delete your data", `neon.com/faqs/free-plan-limits-and-quotas`).

**O que mudou**: `.env.render.example` novo (variáveis mínimas para este
caminho: `DATABASE_URL`, `AUTH_SECRET`, `NODE_ENV`); `render.yaml` novo
(Blueprint do Render, descreve o serviço a partir do `Dockerfile` já
existente, sem alterações a ele); `scripts/backup/backup-neon.sh` novo
(mesma lógica do `backup.sh` original, adaptado para `pg_dump` direto
contra `DATABASE_URL`, sem `docker compose exec`, já que o Neon não é um
container nosso); `docs/operations/RENDER-NEON.md` novo (guia passo a
passo); `.gitignore` com a exceção nova `!.env.render.example`. **Zero
alterações a `src/`.**

**O que NÃO mudou / não foi descartado**: `docker-compose.prod.yml`,
`Caddyfile`, `scripts/backup/backup.sh`/`restore.sh`/`verify-backup.sh`,
e toda a documentação da Oracle (`docs/operations/ORACLE-CLOUD.md`,
`docs/architecture/DEPLOYMENT.md`) continuam no repositório, válidos como
caminho de self-host para o dia em que fizer sentido deixar de depender de
free tiers de terceiros — não foram uma perda, ficam disponíveis.

**Backups nesta fase**: manuais, não automáticos — decisão explícita do
utilizador ("pode ser backup manual periódico para o computador do
proprietário durante a Alpha/Beta inicial... não fingir que existe backup
automático se não existe"). `backup-neon.sh` produz o `.dump`; cabe a quem
gere o Konta correr isto periodicamente e guardar o ficheiro fora do Git,
num local seguro do seu computador. Isto é uma limitação aceite e
documentada, não escondida.

## Painel "Estatísticas" e último login: admin por variável de ambiente, não por campo no schema (31/08/2026)

**Pedido do utilizador**: "como posso observar os meus utilizadores agora,
ver quantos users eu tenho e entre outros?" — depois de ver as três
opções (consola do Neon sozinha, página dentro do Konta, ou página +
registo de último login), escolheu a última: página **e** data do último
login.

**Quem vê `/admin` (Estatísticas)**: `ADMIN_EMAILS`, uma variável de
ambiente com uma lista de emails separados por vírgula
(`src/lib/auth/admin.ts`, `isAdminEmail`) — não um campo `role`/`isAdmin`
no schema. Duas razões: (1) há um único dono do projeto hoje, não um
sistema de permissões a construir; uma coluna nova, uma migração, e UI
para a atribuir seriam trabalho a mais para o problema real; (2)
**fail-closed por omissão** — sem `ADMIN_EMAILS` definida em produção,
`isAdminEmail` devolve sempre `false` para toda a gente, incluindo o
próprio dono, em vez de um valor por omissão "toda a gente é admin" ou
"o primeiro utilizador criado é admin" (qualquer um dos dois seria uma
falha de segurança silenciosa se a variável for esquecida). A página em
si (`src/app/(app)/admin/page.tsx`) devolve `notFound()` (404) para quem
não está na lista, nunca uma mensagem "não autorizado" — um 404 genérico
não confirma sequer que a página existe a quem esteja a adivinhar URLs.

**O que a página mostra**: só contagens e datas (`src/lib/db/admin.ts`) —
total de utilizadores/contas/transações/dívidas/metas, e por utilizador:
email, nome, data de registo, data do último login, número de contas e de
transações. **Nunca** o conteúdo de nenhuma transação, conta ou valor
financeiro de ninguém — mesmo princípio de privacidade já aplicado na
secção "Segurança e privacidade" da página `/help`. Este é o único
ficheiro da app que consulta a tabela `User` inteira sem filtrar por
`userId` — de propósito, e só chamado depois de `isAdminEmail` confirmar
na própria rota/página.

**`lastLoginAt`**: novo campo opcional (`DateTime?`) em `User`
(`prisma/manual-sql/0003_add_last_login.sql` — primeira migração desde as
duas iniciais, estabelece a convenção `000N_descrição.sql` daqui em
diante). Nulo por omissão, incluindo para todas as contas já existentes
antes desta migração — não há forma honesta de reconstruir esse histórico
retroativamente, por isso fica nulo até ao próximo login real, nunca
preenchido com um valor inventado. Atualizado (`touchLastLogin`,
`src/lib/db/users.ts`) em cada login **e** registo bem-sucedido (registar
já inicia sessão de imediato, conta como o primeiro "login"). Em ambos os
casos a atualização nunca bloqueia a autenticação: `touchLastLogin(...)
.catch(() => undefined)` — se isto falhar por algum motivo, a pessoa
continua a entrar normalmente, porque "último login" é informação de
conveniência para o dono da app, não uma condição de autenticação.

**Navegação**: entrada "Estatísticas" em `src/components/app-shell.tsx`
(sidebar desktop + ícone no cabeçalho mobile), condicional a `isAdmin`,
fora de `NAV_ITEMS` pela mesma razão que "Ajuda" já estava — nunca
ocuparia lugar na barra inferior em mobile para o resto dos utilizadores.

**Operacional, antes de ir para produção**: `0003_add_last_login.sql`
tem de ser aplicado manualmente à base de dados Neon de produção (ver
`docs/operations/RENDER-NEON.md`), e `ADMIN_EMAILS` tem de ser definida
no painel do Render com o email de login do dono — sem os dois, a
próxima versão publicada falha silenciosamente para este utilizador
(página sempre 404) até isso ser feito.

## Feedback direto na app: nova tabela ligada ao utilizador, sem edição/eliminação (31/08/2026)

**Pedido do utilizador**: um campo na página `/help` para enviar sugestões,
problemas e melhorias diretamente, visível depois na página Estatísticas
(`/admin`), organizado por quem escreveu e por data.

**Modelo de dados**: nova tabela `Feedback` (`prisma/schema.prisma`,
`prisma/manual-sql/0004_add_feedback.sql`) — `id`, `userId` (obrigatório,
`ON DELETE CASCADE`), `message`, `createdAt`. Sempre ligada ao utilizador
autenticado da sessão, nunca a um id vindo do corpo do pedido (mesma regra
de todas as outras rotas de escrita — ver `src/app/api/feedback/route.ts`)
— não há feedback anónimo, precisamente para o dono conseguir responder ou
dar seguimento sabendo de quem é.

**Sem "assunto" ou categoria estruturada**: para o volume esperado numa
Beta pequena, uma lista simples ordenada por data (mais recente primeiro)
já é suficiente para o dono acompanhar. Categorizar por tipo (bug vs.
sugestão vs. elogio) fica documentado aqui como possível fast-follow, não
implementado agora — evita construir uma taxonomia sem ainda saber que
tipos de mensagem realmente vão chegar.

**Sem edição nem eliminação pelo próprio autor nesta v1**: mesma filosofia
já aplicada a `InvestmentValuation` — é um relato pontual, não um
documento a manter; o dono do projeto também não tem, propositadamente,
nenhuma forma de apagar uma mensagem a partir da UI (só accessível
diretamente na base de dados, se algum dia for mesmo necessário por razões
de moderação ou de RGPD/privacidade).

**Limite de fair-use**: `POST /api/feedback` usa o mesmo mecanismo de
`src/lib/rate-limit.ts` já usado em login/registo, mas com a chave por
`userId` (não por IP, já que aqui o pedido está sempre autenticado) —
5 mensagens por hora, um valor generoso pensado só para travar um script,
nunca uma pessoa real a mandar duas ou três mensagens seguidas.

**Onde aparece**: um formulário simples (`src/components/feedback-form.tsx`,
textarea + botão) numa nova secção da página `/help`; a página
`/admin` mostra uma nova estatística de contagem e, por baixo da tabela de
utilizadores, a lista completa de mensagens com autor (nome + email) e
data/hora — mesmo princípio de privacidade de `src/lib/db/admin.ts`: só o
dono do projeto vê isto.

**Operacional, antes de ir para produção**: `0004_add_feedback.sql` tem de
ser aplicado manualmente à base de dados Neon de produção (ver
`docs/operations/RENDER-NEON.md`) antes do próximo `git push` — sem isto,
qualquer tentativa de enviar feedback em produção falha (tabela
inexistente), embora isso não afete login, registo, nem nenhuma outra
funcionalidade já existente.

## Escolher moeda ao criar conta + Dashboard agrupado por moeda, nunca convertido (01/09/2026)

**Pedido do utilizador**: feedback de amigos fora de Cabo Verde — perguntaram
se era possível usar outra moeda além do Escudo.

**O modelo de dados já suportava isto**: `Account.currency` e
`Transaction.currency` (esta última herdada da conta de origem na
criação — ver `src/app/api/transactions/route.ts`) existem desde a
primeira migração. O que faltava era só a UI nunca oferecer escolha
nenhuma — o formulário de criar conta enviava sempre `currency`
implícito, e o servidor assumia `CVE` por omissão.

**Lista curada, não texto livre**: em vez de um campo ISO 4217 livre
(fácil de escrever mal — "EU" em vez de "EUR"), `src/lib/currencies.ts`
define uma paleta fixa (CVE, EUR, USD, GBP, BRL — os destinos mais comuns
da diáspora cabo-verdiana), mesmo padrão já usado para a cor da conta em
`src/lib/account-colors.ts`. Tanto `account-form.tsx` como o zod schema de
`POST /api/accounts` leem da mesma lista (`CURRENCIES`/`CURRENCY_CODES`),
nunca duas listas a poderem divergir. Decisão confirmada com o utilizador
via pergunta direta: lista curada, não texto livre.

**O bug que isto obrigou a corrigir primeiro**: as funções de agregação do
Dashboard (`getNetWorth`, `getAvailableBalance`, `getIncomeTotal`,
`getExpenseTotal`, `getCashflow`, `getSavingsRate`, `getCategoryBreakdown`
em `src/lib/financial-engine`) somavam sempre TODAS as contas/transações,
qualquer que fosse a moeda — inofensivo enquanto só existia CVE, mas
produziria um número sem significado (escudos + euros somados como se
fossem a mesma unidade) assim que alguém tivesse contas em duas moedas.
Como o motor não faz — e nunca fez, por decisão consciente (ver FAQ em
`/help`) — conversão cambial, a única opção correta era nunca somar entre
moedas. Confirmado com o utilizador via pergunta direta: agrupar por
moeda, sem converter.

**Implementação**: cada uma das sete funções acima ganhou um parâmetro
`currency?: string` opcional no fim da assinatura — quando omitido,
preserva exatamente o comportamento anterior (soma tudo), o que manteve
toda a suite de testes existente a passar sem alterações. `grep` confirmou
que o único consumidor em produção destas funções é
`src/app/(app)/dashboard/page.tsx` (mais o próprio ficheiro de testes), o
que tornou esta mudança de baixo risco. O Dashboard passou a descobrir as
moedas em uso pelas contas não arquivadas (`currenciesInUse`) e a chamar
cada função uma vez por moeda, através de um novo componente
`CurrencySummary` — quando só há uma moeda (o caso de praticamente todos os
utilizadores hoje), `showHeading` fica `false` e o ecrã continua pixel a
pixel igual ao que já era; só a partir de duas moedas em uso é que cada
bloco ganha um pequeno cabeçalho ("Em EUR", "Em CVE") a identificar de que
moeda se trata.

**Não editável depois de criada**: a moeda da conta não entra nos campos
editáveis de `updateAccount` (decisão já tomada antes desta funcionalidade
existir, mantida sem alterações) — mudar a moeda de uma conta com
transações já registadas nessa moeda misturaria unidades em silêncio.

**Testes novos**: `balance.test.ts` ganhou um novo `describe` com uma
conta CVE e outra EUR, cobrindo o comportamento sem `currency` (soma tudo,
igual a antes) e com `currency` (isola cada moeda); novo ficheiro
`cashflow.test.ts` (não existia nenhum antes) cobre o mesmo para
`getIncomeTotal`/`getExpenseTotal`/`getCashflow`/`getSavingsRate`/
`getCategoryBreakdown`.

**Sem alteração de schema, sem migração nova**: `Account.currency` e
`Transaction.currency` já existiam em produção desde `0001_init.sql` — ao
contrário das duas funcionalidades anteriores (estatísticas de admin,
feedback), esta não precisa de nenhum passo manual na base de dados Neon
nem de nenhuma variável de ambiente nova no Render antes de publicar.

## Correção: página deixava de caber no ecrã em iPhone/Android — "preciso de fazer zoom out" (04/09/2026)

**Pedido do utilizador**: feedback de utilizadores da Beta em iPhone — o
site não estava 100% responsivo, era preciso afastar o zoom manualmente
para ver tudo. O próprio utilizador notou que o Dashboard vazio estava bem
responsivo, mas isso deixou de acontecer depois de adicionar transações.

**Causa raiz — não era um problema do Safari**: reproduzido com sucesso
tanto com user-agent do Safari/iOS como do Chrome/Android (browser
automation, viewports 375-390px), por isso descartado como bug específico
de um motor — é puro CSS flexbox. A tabela de Transações
(`src/app/(app)/transactions/page.tsx`) tem `min-w-[600px]` dentro de um
`overflow-x-auto`, precisamente para poder ter scroll horizontal próprio
em ecrãs estreitos — o mesmo padrão já usado (e comentado) na barra de
navegação inferior do `AppShell`. Mas faltava uma peça: o `<div
className="flex min-h-screen flex-1 flex-col">` em
`src/components/app-shell.tsx`, que envolve o conteúdo principal, é filho
de uma flexbox em linha (`flex min-h-screen`, ao lado da sidebar) e por
omissão os filhos flex têm `min-width: auto` — ou seja, o browser recusa-se
a encolhê-lo abaixo da largura mínima do seu conteúdo. Com uma tabela de
600px lá dentro, esse filho (e por arrasto a página inteira) crescia para
600px+ em vez de a tabela ficar só com scroll horizontal próprio, que é o
que `overflow-x-auto` devia estar a fazer. Isto só ficava visível depois
de existirem transações (a tabela só aparece com dados — daí o Dashboard
vazio parecer bem responsivo e a página de Transações não).

**Correção** (aplicada uma só vez, na estrutura partilhada por toda a app,
não tabela a tabela): `min-w-0` acrescentado a esse único `<div>` em
`app-shell.tsx` — o mesmo truque que a barra de navegação inferior já usava
internamente, só que em falta um nível acima. Verificado com uma reprodução
isolada (HTML mínimo com o mesmo padrão flex, fora da app) que
`document.documentElement.scrollWidth` passa de 699px para exatamente
390px (a largura do ecrã) só com esta mudança — e confirmado que a mesma
tabela de 600px, e a tabela equivalente em `/admin`
(`min-w-[560px]`), ficam ambas corretamente resolvidas por esta única
correção partilhada, sem precisar de tocar em cada tabela.

**Duas correções extra, especificamente por causa do pedido de verificar
compatibilidade com Safari/iPhone**, encontradas ao rever a app com esse
foco (não reportadas diretamente pelos utilizadores, mas com o mesmo
sintoma final de "a app não se comporta bem no telemóvel"):

1. *Zoom automático ao tocar num campo*: o Safari do iOS (e alguns Android
   mais antigos) aumenta o zoom da página sozinho sempre que a pessoa toca
   num campo de formulário com `font-size` abaixo de 16px — e a app usa
   `text-sm` (14px) em quase todos os inputs/selects
   (`src/components/ui/input.tsx` e vários `<select>` inline). Corrigido
   globalmente em `globals.css`, com uma media query até 640px (só onde
   isto acontece a sério, em telemóvel — o tamanho de letra em ecrã largo
   fica inalterado).
2. *Barra de navegação inferior sobreposta pelo indicador de "home"*: em
   iPhones sem botão físico (todos os atuais), o Safari reserva uma faixa
   para o gesto de "home" — uma barra fixa (`fixed bottom-0`) sem margem
   para essa área fica demasiado colada a ela. Corrigido com
   `env(safe-area-inset-bottom)` na barra e no espaço reservado para ela em
   `<main>`; isto só produz um valor diferente de zero com
   `viewportFit: "cover"` no `viewport` da app — que não existia (o
   Next.js só injetava o valor por omissão, sem este campo), por isso
   passou a ser definido explicitamente em `src/app/layout.tsx`.

**Verificação**: `tsc`, `eslint` e a suite de testes (93 testes) sem
alterações — este é um bug de CSS/layout, não de lógica; a verificação
principal foi a reprodução isolada acima, mais confirmação de que as três
classes/regras (`min-w-0`, a media query dos 16px, e
`safe-area-inset-bottom`) aparecem de facto no CSS compilado
(`.next/static/chunks/*.css`) depois do `next build`.

## Botão "Editar conta" escondido no Resumo (só visível em Contas)

**Pedido do utilizador**: no cartão de conta (`account-card.tsx`) do
Resumo (`/dashboard`), o lápis "Editar conta" foi removido — a intenção do
utilizador é que essa ação só exista na página Contas (`/accounts`), onde
a conta é mesmo gerida; no Resumo o cartão é só um atalho visual de saldo,
e o lápis ali estava a confundir-se com "editar o saldo em si".

**Correção**: nova prop `showEditButton?: boolean` em `AccountCardProps`
(`src/components/account-card.tsx`), a envolver o `<Link
href={`/accounts/${id}/edit`}>` já existente. Segue exatamente a mesma
convenção já usada por `showArchiveButton`/`showDeleteButton` nesse mesmo
componente: omitida equivale a `true` (visível), para não esconder o botão
em nenhum sítio que já usa este cartão sem passar esta prop
explicitamente — só a chamada em `src/app/(app)/dashboard/page.tsx` passa
`showEditButton={false}`. A página Contas (`src/app/(app)/accounts/page.tsx`)
não precisou de nenhuma alteração — já não passava esta prop, por isso
continua a mostrar o botão (omitido = `true`).

**Verificação**: `tsc`, `eslint`, suite de testes (93 testes) e `next
build` sem alterações — mudança de UI pura, sem lógica nova.

## Ativar/desativar o acesso ao Konta AI por utilizador, a partir de /admin (07/09/2026)

**Pedido do utilizador**: "quero adicionar um botão para cada pessoa que
fez sign in no aplicativo, na página estatísticas aparecer um botão
respetivo a cada nome, onde esse botão posso ativar e desativar o acesso
ao Konta AI para cada user."

**Novo campo `aiEnabled`** (`Boolean @default(true)`) em `User`
(`prisma/manual-sql/0005_add_ai_access_toggle.sql` — quinta migração desde
`0001_init.sql`, mesma convenção `000N_descrição.sql` de
`0003_add_last_login.sql`/`0004_add_feedback.sql`). `true` por omissão,
incluindo para todas as contas já existentes antes desta migração —
ninguém que já usava o Konta AI fica bloqueado só por causa dela.

**Onde se vê e muda**: tabela de utilizadores em `/admin`
(`src/app/(app)/admin/page.tsx`), nova coluna "Konta AI" com um botão
(`src/components/user-ai-access-button.tsx`, mesmo padrão do já existente
`AccountArchiveButton` — reversível a qualquer momento com o mesmo botão,
sem `window.confirm`) que chama `POST
/api/admin/users/[userId]/ai-access`. Esta é a primeira rota de API
restrita ao dono do projeto: segue a mesma filosofia de autorização já
usada pela própria página `/admin` — `isAdminEmail` (`src/lib/auth/admin.ts`)
e, para quem não está em `ADMIN_EMAILS`, um 404 genérico ("Não
encontrado."), nunca "não autorizado"/403, para não confirmar sequer que
a rota existe a quem esteja a adivinhar URLs. A escrita em si vive em
`setAiEnabledForUser` (`src/lib/db/admin.ts`) — tal como o resto deste
ficheiro, não verifica `isAdminEmail` a si própria, a rota é que tem de o
fazer antes de chamar.

**Onde se aplica de facto**: `POST /api/ai/chat`
(`src/app/api/ai/chat/route.ts`) passou a verificar
`isAiEnabled(session.userId)` (nova consulta dedicada em
`src/lib/db/users.ts`, mesmo padrão pontual de `touchLastLogin` — não
acrescentada a `UserRow`/`findUserById`, que é usado por muito mais
código sem nenhuma razão para carregar este valor) logo a seguir à sessão,
antes até do rate limit e do parsing do corpo — nas três ações possíveis
(`message`/`confirm`/`cancel`), nunca só em `message`: desativar o acesso
é uma paragem total, não um "não inicies conversas novas". Fail-closed,
mesma filosofia de `isAdminEmail`: se a linha do utilizador não existir
por algum motivo, `isAiEnabled` devolve `false`, nunca assume acesso
ativo por omissão. `src/app/(app)/assistant/page.tsx` (Server Component)
faz a mesma verificação só por UX — mostra um estado claro em vez de
montar o `ChatPanel` só para a primeira mensagem falhar com um erro; a
verificação que realmente impede o uso continua a ser a da rota.

**Nunca escondido do próprio utilizador desativado de forma confusa**: a
mensagem em `/assistant` e o erro 403 de `/api/ai/chat` dizem
explicitamente que o acesso foi desativado — em nenhum dos dois sítios o
Konta AI finge estar disponível e depois falha silenciosamente.

**Operacional, antes de ir para produção**:
`0005_add_ai_access_toggle.sql` tem de ser aplicado manualmente à base de
dados Neon de produção (ver `docs/operations/RENDER-NEON.md`) antes desta
versão ser publicada — sem a coluna, tanto `isAiEnabled` como
`setAiEnabledForUser` falham a consultar/escrever um campo inexistente.

**Verificação**: `tsc`, `eslint`, suite de testes (284 testes, 17 novos,
1 ficheiro de teste novo) e `next build` todos limpos.

## Contas novas nascem sem acesso ao Konta AI; item de menu só aparece depois de ativado (07/09/2026)

**Pedido do utilizador**: "ao criar uma conta no meu aplicativo pela
primeira vez, quero que ela venha logo sem o Konta AI, depois de eu
ativar para aparecer" — o inverso deliberado da decisão anterior
(`aiEnabled` nascia `true`).

**Porque não é uma contradição**: a migração 0005 tinha de usar
`DEFAULT true` — já existiam utilizadores a usar o Konta AI nesse
momento, e uma migração de schema nunca pode desativar alguém em
silêncio. Este pedido é sobre o comportamento DAQUI PARA A FRENTE, para
contas que ainda não existem: mudar o `DEFAULT` outra vez não é voltar
atrás, é resolver dois problemas diferentes, cada um no seu momento.
`prisma/manual-sql/0006_ai_access_default_false_for_new_users.sql` faz só
`ALTER TABLE "User" ALTER COLUMN "aiEnabled" SET DEFAULT false` — nunca um
`UPDATE` — por isso todos os utilizadores já registados mantêm
exatamente o `aiEnabled` que já tinham; só uma conta criada a partir de
agora (`createUser`, `src/lib/db/users.ts`, cujo `INSERT` nunca menciona
esta coluna, sempre confiou no `DEFAULT` da base de dados) nasce
desativada. `prisma/schema.prisma` foi atualizado para `@default(false)`
a acompanhar, com os dois momentos documentados lado a lado no
comentário do campo.

**"Depois de eu ativar para aparecer" — item de menu, não só acesso
bloqueado**: `POST /api/ai/chat` e `/assistant` já bloqueavam um
utilizador desativado (secção anterior) — mas isso by itself deixaria a
entrada "Konta AI" visível na sidebar/barra inferior para sempre, a levar
a uma página de "acesso desativado". O pedido é mais literal do que isso:
a entrada só aparece quando ativada. `src/app/(app)/layout.tsx` passou a
calcular `isAiEnabled(session.userId)` (mesma função da secção anterior)
e a passá-lo como prop `aiEnabled` a `AppShell`
(`src/components/app-shell.tsx`), que filtra o item `/assistant` fora de
`NAV_ITEMS` antes de o desenhar — a mesma lista filtrada alimenta a
sidebar e a barra inferior mobile, nunca duas fontes de verdade a
divergir. Isto é só UX (esconder um link) — a verificação que continua a
impedir o uso de facto é a de `POST /api/ai/chat`; alguém que soubesse o
URL `/assistant` de cor continuaria a ver a página "acesso desativado" lá
descrita, nunca a app real.

**Verificação**: `tsc`, `eslint`, suite de testes (284 testes — nenhum
teste novo: mudança de `DEFAULT` de coluna e de UI de navegação, sem
lógica nova testável por mock de `pg`; este repositório não tem testes de
componente React) e `next build` todos limpos.
