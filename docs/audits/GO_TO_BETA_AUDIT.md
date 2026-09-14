# KONTA — GO-TO-BETA AUDIT

**Data**: 29/08/2026
**Pergunta central**: se colocares o Konta online e deres acesso a 10–30 utilizadores reais, o que pode correr mal?
**Método**: leitura direta do repositório (`/root/projects/konta`), não do STATUS.md — o STATUS.md foi tratado como ponto de partida, não como fonte de verdade. Cinco auditorias independentes (segurança, base de dados, API, UX/responsividade, performance/deployment) mais uma auditoria própria do Financial Engine, com `npx tsc --noEmit`, `npx eslint .` e `npm run build` corridos de facto, não assumidos.

---

## 1. Executive Summary

O Konta está tecnicamente muito mais perto de "pronto para Beta" do que a maioria dos projetos nesta fase — build limpo (0 erros TypeScript, 0 erros ESLint), isolamento multi-utilizador correto em quase todos os pontos, sem XSS, sem SQL injection, sem segredos no repositório. Durante esta auditoria encontrei e **já corrigi** um bug crítico real: qualquer utilizador autenticado conseguia criar dinheiro do nada fazendo uma transferência de uma conta para ela própria. Está corrigido, testado e já no teu PC.

O que falta não é "mais funcionalidades" — é **resiliência de produção**: o que acontece quando a base de dados tem um soluço de rede (hoje: a aplicação inteira crasha), e o que acontece se o disco onde a base de dados vive falhar (hoje: perdes os dados financeiros de todos os utilizadores beta, para sempre, sem cópia nenhuma). Nenhum destes dois já aconteceu — mas para uma aplicação cujo propósito é ser um registo de confiança do dinheiro de alguém, "ainda não aconteceu" não é o mesmo que "está seguro".

Dívidas e Metas — as duas páginas "Em construção" — **não bloqueiam** a Beta. Ver secção 9 da tua pergunta original, respondida em detalhe na secção 19.

## 2. Estado atual real

Confirmado por leitura direta (não por confiar no STATUS.md):

- Next.js 16.3.3, React 19.2.8, TypeScript, Tailwind v4 — confirmado em `package.json`.
- `npx tsc --noEmit` → 0 erros. `npx eslint .` → 0 erros/avisos. `npm run build` → sucesso, 19 rotas geradas.
- 22 testes automáticos a passar (`npx vitest run`) — eram 20 no STATUS.md; subiram para 22 durante esta auditoria (um teste novo para o bug crítico encontrado aqui, um para o bug de saldo futuro encontrado por ti na sessão anterior).
- Accounts, Transactions (com histórico completo, filtros, edição, remoção), Categories, Dashboard, autenticação — todos com API real e Server Components reais, confirmados ficheiro a ficheiro.
- Debts e Goals: o STATUS.md diz "sem UI/API completa" — confirmado exatamente assim. Não existe `src/lib/db/debts.ts`, `goals.ts` nem `recurring.ts`. As páginas `/debts` e `/goals` são stubs honestos ("Em construção"), não fingem dados.
- Migração do localStorage: só o documento de mapeamento (`docs/architecture/MIGRATION.md`) existe, tal como o STATUS.md afirma. Nenhum script executável.

### Cenários reais testados contra o código (pedido na tua secção 4)

| # | Cenário | Resultado |
|---|---|---|
| 1–5 | Registo → primeira conta → salário → despesa → segunda conta | Funciona, sem números inventados (verificado em `dashboard/page.tsx`) |
| 6 | Transferência entre contas | Funciona corretamente — **exceto** o caso de auto-transferência, que era o BLOCKER agora corrigido |
| 7–8 | Editar / apagar transação | Funciona, `updateTransaction`/`deleteTransaction` sempre filtrados por `userId` |
| 9 | Transação futura | Corrigido na sessão anterior (ver `DECISIONS.md`, "Saldo não pode incluir o futuro") |
| 10 | Dois utilizadores em simultâneo | Sem problema — cada `db/*.ts` filtra sempre por `userId`, sem estado partilhado no servidor |
| 11 | Um utilizador tenta aceder a recurso de outro manipulando IDs | `transactions/[id]` (GET/PATCH/DELETE) e `accounts` corretamente devolvem 404/lista vazia, nunca dados alheios. **Exceção parcial**: `categoryId` numa transação não é verificado como pertencente ao utilizador (ver 6.2) |
| 12–13 | Valores extremos / negativos indevidos | Era possível enviar um valor acima da precisão segura de JS e corromper o montante guardado, ou rebentar o Postgres com um 500 não tratado — **corrigido nesta auditoria** (ver 5.2) |
| 14 | Fechar/reabrir a app | Sessão JWT dura 30 dias em cookie `httpOnly`; sem problema esperado |
| 15 | Erro de API | Vários endpoints não tratam exceções (ver 6.3) — resulta num 500 genérico em vez de uma mensagem limpa, mas não em fuga de dados |
| 16 | Erro de base de dados | **Sem tratamento nenhum** — a app inteira crasha (ver secção 16) |
| 17 | Sessão expirada | `proxy.ts` + verificação criptográfica em `(app)/layout.tsx` cobrem isto corretamente |
| 18 | Mobile | Boa — nav inferior + FAB, tabela com scroll horizontal próprio, formulário de transação bem rotulado (ver secção 14) |
| 19 | Várias transações rápidas | Botões de submissão desativam-se durante o pedido — sem risco de duplicação por duplo clique |
| 20 | Milhares de transações | Sem problema à escala de 10–30 utilizadores (índice `(userId, date)` cobre a query principal) — ver secção 15 para o que fica caro a prazo |

## 3. O que já está sólido

- **Isolamento multi-utilizador**: toda a função em `src/lib/db/*.ts` recebe e filtra por `userId` explicitamente. Testado e confirmado em `accounts.ts`, `transactions.ts`, `categories.ts`, `users.ts`.
- **Zero SQL injection**: toda a query usa `$1/$2/...`; a única concatenação de string é para posições de placeholder, nunca para valores.
- **Zero XSS**: nenhuma ocorrência de `innerHTML`/`dangerouslySetInnerHTML` no repositório.
- **Dinheiro sempre em `BigInt`**, nunca `float` — confirmado até ao SQL (`BIGINT` em todas as colunas monetárias).
- **Datas sempre locais** (`DATE`, nunca `TIMESTAMPTZ`) para o dia da transação — o bug de fuso horário da auditoria original não voltou a aparecer em lado nenhum.
- **`.env` nunca foi commitado** — confirmado via `git log --all -- .env` (vazio).
- **Duas camadas de autenticação reais**: `proxy.ts` (verificação barata no Edge) + `getSessionUser()` (verificação criptográfica completa) em `(app)/layout.tsx` antes de qualquer página protegida renderizar.
- **Formulários com proteção contra duplo-clique** (`transaction-form.tsx`, `account-form.tsx`) e mensagens de erro visíveis, não silenciosas.
- **Build, lint e testes limpos** — não há dívida técnica escondida a impedir o deploy.

## 4. 🔴 Blockers

### 4.1 [CORRIGIDO NESTA AUDITORIA] Auto-transferência cria dinheiro do nada
**Ficheiro**: `src/lib/financial-engine/balance.ts:46-52` (lógica) + `src/app/api/transactions/route.ts:39-56` (validação, agora com `.refine()` novo).
Uma `TRANSFER` com `accountId === destinationAccountId` não era rejeitada por nenhuma validação. Em `getAccountBalance`, `isIncoming` e `isOutgoing` eram calculados como verdadeiros ao mesmo tempo para essa conta, mas a lógica era `if (isIncoming) ...; else if (isOutgoing) ...` — só a soma corria, nunca a subtração. **Qualquer utilizador autenticado, sem precisar de aceder a dados de outro, conseguia inflacionar o próprio saldo à vontade.**
**Corrigido**: rejeição na API (`.refine()`) + o motor de cálculo passou a usar dois `if` independentes (efeito líquido zero para uma auto-transferência, por construção). Teste de regressão em `balance.test.ts`. Já sincronizado para o teu PC.

Nenhum outro Blocker foi encontrado no código correto-em-uso-normal. Os itens de resiliência de produção (crash do processo, ausência de backups) estão classificados como Blocker/High na secção de Produção porque, apesar de não serem "bugs" no sentido de comportamento errado hoje, o impacto de os ignorar é do mesmo calibre — ver secção 16.

## 5. 🟠 High Priority

**5.1 — Sem rate limiting em `/api/auth/login` e `/api/auth/register`.**
`src/app/api/auth/login/route.ts` (todo o ficheiro). Sem throttling, lockout ou CAPTCHA. `proxy.ts` não cobre rotas `/api/*`. Um atacante pode tentar passwords sem limite contra a conta de qualquer beta user. Para uma app financeira com pessoas reais, isto é o item de segurança mais importante a fechar antes do lançamento.

**5.2 — [CORRIGIDO NESTA AUDITORIA] `amountMinor`/`initialBalanceMinor` sem limite superior.**
`src/app/api/transactions/route.ts:44`, `[id]/route.ts:18`, `src/app/api/accounts/route.ts:41` (antes da correção). Um valor JS acima de `Number.MAX_SAFE_INTEGER` já perde precisão em `JSON.parse` antes do Zod o ver; um valor ainda maior rebentava o `BIGINT` do Postgres com um erro não tratado (500). Corrigido com `.max(Number.MAX_SAFE_INTEGER)` nos três schemas.

**5.3 — Sem listener `'error'` no pool de ligações à base de dados.**
`src/lib/db/client.ts:29-34`. `pg.Pool` emite `'error'` quando uma ligação inativa falha; sem um handler, o Node.js mata o processo inteiro. Qualquer soluço de rede transitório, reinício do Postgres, ou timeout de ligação — coisas que **vão** acontecer numa base de dados na internet — derruba a aplicação completa para todos os utilizadores, não só para quem estava a usar naquele momento.

**5.4 — Sem error boundary (`error.tsx`) em lado nenhum do App Router.**
Confirmado — zero ficheiros `error.tsx`/`global-error.tsx`. Se um Server Component rebentar (por exemplo, por causa de 5.3), o utilizador vê a página genérica de erro do Next.js, sem hipótese de recuperar, sem contacto de suporte.

**5.5 — Zero logging em toda a aplicação.**
`grep -rn "console\.(log|error|warn)" src` → nenhum resultado. Combinado com 5.3/5.4: se algo correr mal em produção, não há absolutamente nenhum rasto — descobres pelo utilizador a reclamar, não por um log.

**5.6 — Sem endpoint de health-check.**
Não existe `/api/health`. Qualquer plataforma de alojamento fica sem forma de detetar e reiniciar automaticamente uma instância pendurada.

**5.7 — Sem estratégia de backup da base de dados.**
`docker-compose.yml` define só um volume Docker nomeado, sem exportação/snapshot automática. Para uma app financeira, perder o volume (disco, erro humano, `docker volume rm` acidental) apaga o histórico financeiro de todos os utilizadores beta, sem recuperação possível.

## 6. 🟡 Medium Priority

**6.1 — Sem Dockerfile nem configuração de produção no `next.config.ts`.** Ainda não há uma resposta a "como é que isto corre num servidor real" — nem `output: "standalone"`, nem imagem, nem processo de deploy documentado.

**6.2 — `categoryId` numa transação não é verificado como pertencente ao utilizador.** `src/lib/db/transactions.ts` (`createTransaction`/`updateTransaction`) + `src/lib/db/categories.ts` (sem `getCategoryById` nenhum). Ao contrário de `accountId`/`destinationAccountId` (verificados via `getAccountById(session.userId, ...)`), um `categoryId` adivinhado de outro utilizador é aceite sem verificação. Exposição prática limitada hoje (nenhum endpoint devolve os detalhes da categoria de outro utilizador), mas viola a invariante que o resto do código segue.

**6.3 — `GET /api/transactions` não valida `limit`/`offset`.** `src/app/api/transactions/route.ts:27-28` faz `Number(...)` sem verificar `NaN` ou negativos, e sem try/catch — um valor inválido rebenta como 500 não tratado do Postgres em vez de um 400 limpo.

**6.4 — Sessões não podem ser revogadas.** `src/lib/auth/jwt.ts` — token válido por 30 dias, sem `jti`/denylist. "Logout" só apaga o cookie; um token copiado continua válido.

**6.5 — Duplicados de registo por maiúsculas/minúsculas no email.** `src/lib/db/users.ts` não normaliza o email para minúsculas antes de comparar/inserir — `Test@x.com` e `test@x.com` registam-se como duas contas distintas.

**6.6 — `listAllTransactionsForBalances` sem paginação nem cache**, recalculada do zero em cada carregamento do dashboard/contas (`dashboard/page.tsx`, `accounts/page.tsx`). Sem problema a 10–30 utilizadores; fica progressivamente mais caro à medida que a história de cada utilizador cresce.

**6.7 — Dessincronização schema/SQL que só importa quando Debts/Goals/Recurring forem implementados**: FKs opcionais sem `ON DELETE SET NULL` no SQL manual (o Prisma geraria isto por omissão); tipos TypeScript de `Debt`/`Goal`/`RecurringTransaction` com campos em falta (`currency`, `creditorName`, `name`); `interestRate` tipado como `number` quando devia ser tratado com a mesma disciplina "nunca float" do resto do dinheiro. Nada disto é usado ainda por código real — corrigir antes de escrever a camada `db/debts.ts`, não depois.

**6.8 — Sem `<label>` no formulário de filtros de transações e no formulário de contas.** `transactions/page.tsx` (filtros) e `account-form.tsx` — inputs só com placeholder, sem nome acessível para leitores de ecrã.

**6.9 — Eliminar uma dívida/meta/série recorrente falharia com erro de FK em vez de preservar o histórico.** Dormant hoje (não existe função de delete para nenhuma destas entidades ainda), mas a decisão (preservar histórico com `SET NULL` vs bloquear) deve ser tomada antes de implementar Debts/Goals, não descoberta depois em produção.

## 7. 🟢 Low Priority

- Estado de registo (`409` vs `201`) revela se um email já existe, apesar da mensagem genérica — comum, baixo risco para 10-30 utilizadores.
- Diferença de tempo de resposta no login (bcrypt só corre se o utilizador existir) permite inferir emails registados por timing.
- `EmptyState` em `transactions/new` e no dashboard sem conta nenhuma não tem botão de ação para ir criar uma conta — o componente já suporta isso (`action` prop), só não é usado.
- Ícones de editar/apagar transação (`transaction-row-actions.tsx`) com 36×36px, abaixo do alvo de toque recomendado (~44px), lado a lado com pouco espaço.
- Menu inferior mobile esconde "Metas" (só mostra 4 dos 5 itens) — sem impacto real enquanto a página for um stub.
- Sistema de cores por categoria definido em `globals.css` mas nunca usado nos badges (`tone="neutral"` sempre).
- `Skeleton` component existe mas nunca é importado — sem loading state visual em lado nenhum.
- IDs gerados como `'c' + uuid` em vez de um CUID real — funcional, só relevante para o dia da migração real para Prisma.

## 8. 🔵 Future

- Rate limiting geral / CAPTCHA (fora do rate limiting específico de login, esse é High).
- CORS — só relevante quando existir um cliente de origem diferente (Mobile).
- Migração automática de dados do `localStorage` do protótipo — não há utilizadores do protótipo a migrar ainda.
- Observabilidade a sério (Sentry, métricas, tracing).
- IA, Open Banking, pagamentos, app nativa — já fora de âmbito por decisão tua.

## 9. Security Audit

Feito por leitura direta de `src/lib/auth/*`, `src/proxy.ts`, `(app)/layout.tsx`, e todas as rotas `src/app/api/**`.

**Positivo, confirmado**: SQL parametrizado em 100% das queries; zero XSS; `.env` nunca commitado; `auth/me` nunca devolve `passwordHash`; toda rota comprovadamente chama `getSessionUser()` e devolve 401 antes de tocar em dados; mensagens de erro de login/registo genéricas o suficiente para não confirmar/negar existência de conta pela *mensagem* (a distinção ainda existe pelo *código HTTP* e pelo *tempo de resposta*, ver 7).

**Findings**: ver 5.1 (rate limiting, HIGH), 6.2 (categoryId, MEDIUM), 6.4 (revogação de sessão, MEDIUM), 6.5 (email case-sensitive, MEDIUM), itens de enumeração/timing (LOW, secção 7). `sameSite: "lax"` nos cookies de sessão (não `"strict"`) sem token CSRF adicional — aceitável para uma API JSON same-origin, sem defesa em profundidade extra. `proxy.ts` só protege rotas de página, não `/api/*` — não é uma falha hoje (todas as rotas de API verificam sessão manualmente), mas significa que uma rota nova sem essa verificação ficaria silenciosamente exposta.

## 10. Database Audit

Feito por comparação linha a linha entre `prisma/schema.prisma`, `prisma/manual-sql/0001_init.sql`, `0002_seed_categories.sql` e `src/lib/financial-engine/types.ts`.

**Positivo, confirmado**: todo o dinheiro é `BIGINT`; toda a data de calendário é `DATE` (nunca `TIMESTAMPTZ`); `User.email` tem `UNIQUE`; `DebtInstallment` tem `UNIQUE(debtId, sequence)`; toda a tabela user-scoped tem `userId` indexado; nullability e defaults batem certo campo a campo entre schema e SQL, com as exceções na secção 6.7.

**Findings**: ver 6.2 (categoryId sem ownership check — o mais importante, também listado na API audit), 6.7 (drift schema/SQL/types só relevante para Debts/Goals/Recurring, ainda não implementados), 6.5 (email case-sensitivity). `Transaction.accountId` tem `ON DELETE CASCADE` — apagar uma conta apagaria o histórico de transações real; não há função de apagar conta ainda, mas a decisão (arquivar em vez de apagar, já suportado por `isArchived`) deve ficar explícita antes de uma existir.

## 11. API Audit

Todas as 8 rotas (`auth/register`, `login`, `logout`, `me`, `accounts`, `transactions`, `transactions/[id]`, `categories`) foram lidas handler a handler.

| Rota | Auth | Validação | Isolamento |
|---|---|---|---|
| auth/register, login, logout, me | OK | OK | n/a |
| accounts GET/POST | OK | OK (após correção 5.2) | OK |
| categories GET/POST | OK | OK | OK |
| transactions GET | OK | Sem validação de `limit`/`offset` (6.3) | OK — filtros sempre AND com `userId`, nunca vazam dados de outro |
| transactions POST | OK | OK após correções 4.1/5.2 | Conta/destino verificados; `categoryId` não (6.2) |
| transactions/[id] GET/PATCH/DELETE | OK | PATCH herda 5.2/6.2 | **OK** — sempre `WHERE userId = $1 AND id = $2`, confirmado nos três verbos |

O único caminho onde um utilizador conseguia afetar dados/saldo fora do que devia era o bug de auto-transferência (4.1), já corrigido. Não há nenhum caso confirmado de um utilizador ler ou escrever a *linha* de outro utilizador.

## 12. Financial Engine Audit

Analisados `balance.ts`, `cashflow.ts`, `money.ts`, `datetime.ts`, `debts.ts`, `goals.ts`, `recurring.ts`, `investments.ts`.

- **`balance.ts`**: o bug 4.1 era aqui. Corrigido e testado. `relevantTransactions` corretamente ignora `PENDING`/`CANCELED` (só `COMPLETED` conta) e respeita `asOfDate` (transações futuras não contam — bug corrigido na sessão anterior).
- **`money.ts`** (`splitIntoInstallments`): divisão inteira exata, resto distribuído pelas últimas parcelas — sem comparação de floats, testado com 7 casos incluindo divisões não exatas.
- **`cashflow.ts`**: filtra sempre por `status === "COMPLETED"`; `getSavingsRate` devolve `null` (não `0` nem `Infinity`) sem receita — evita uma taxa de poupança inventada.
- **`debts.ts`/`goals.ts`/`recurring.ts`/`investments.ts`**: lógica pura pronta e coerente com os princípios do resto do motor (nunca inventa rentabilidade sem avaliação registada, parcelas sempre geradas por divisão inteira), mas sem camada de persistência a chamá-la ainda — ver secção 6.7 para os problemas de tipos que valem a pena corrigir antes disso.

**Novo teste de edge case adicionado**: auto-transferência com efeito líquido zero (`balance.test.ts`, descrito na secção 4.1). Suite total: 22 testes, todos a passar.

## 13. Test Coverage

22 testes, todos em `src/lib/financial-engine/*.test.ts` — **zero testes de rota de API, zero testes de autenticação end-to-end, zero teste de isolamento entre dois utilizadores automatizado** (o isolamento foi confirmado manualmente numa sessão anterior via chamadas reais à API, não por um teste que corra em CI). Para uma Beta, isto é aceitável — a cobertura do Financial Engine (a parte que mais interessa proteger, dado o histórico de bugs financeiros) é boa — mas um próximo passo de qualidade óbvio é um teste de integração mínimo que reproduza exatamente o Cenário 11 (IDOR) e o Cenário 10 (dois utilizadores) contra a API real, não só contra o motor de cálculo isolado.

## 14. UX Audit

Onboarding funcional (registo → dashboard automaticamente), mas o primeiro toque no botão mais promovido da app (FAB "+") por um utilizador com zero contas leva a um beco sem saída — `EmptyState` sem botão para ir criar uma conta (secção 7). Erros de formulário são visíveis, não silenciosos, em todos os 4 formulários verificados. Apagar uma transação falha silenciosamente se a API responder com erro — o único caso de falha silenciosa encontrado.

## 15. Responsive/Mobile Audit

Boa base: menu inferior + FAB central, breakpoint único e consistente (`md`, 768px) em todo o `app-shell.tsx`; a tabela de transações tem scroll horizontal próprio (`overflow-x-auto`), não quebra o layout da página; o formulário de transação usa `inputMode="numeric"` no valor e tem `<label>` em todos os campos — o melhor formulário do código. Pontos a melhorar: formulário de filtros e formulário de conta sem `<label>` (6.8); botões de editar/apagar um pouco pequenos e próximos um do outro (secção 7); "Metas" não aparece no menu mobile (secção 7, sem impacto enquanto for stub).

## 16. Production/Deployment Audit

Este é o bloco mais importante para a decisão de lançar ou não. Resumo dos factos, sem diplomacia: **a aplicação está correta quando está a correr, mas nada a impede de parar de correr por completo ao primeiro problema de rede com a base de dados, e não há nenhuma cópia de segurança dos dados financeiros de ninguém.** Ver 5.3 (crash do processo), 5.4 (sem página de erro), 5.5 (sem logs), 5.6 (sem health check), 5.7 (sem backups), 6.1 (sem Dockerfile/config de produção). `npx tsc --noEmit`, `npx eslint .` e `npm run build` confirmam que o código em si está limpo — o problema não é qualidade de código, é ausência de rede de segurança operacional.

## 17. Test Coverage
Ver secção 13 (mantido aqui por completude da estrutura pedida — mesmo conteúdo).

## 18. Beta Readiness Checklist

```
SECURITY
[x] Auth isolado por utilizador (JWT + cookie httpOnly)
[x] Zero XSS / zero SQL injection confirmados
[ ] Rate limiting em /api/auth/login e /api/auth/register
[ ] Verificação de ownership em categoryId
[ ] Normalizar email para minúsculas no registo/login

DATABASE
[x] Schema com FKs, índices e constraints de unicidade corretos para o que já está implementado
[x] Dinheiro em BIGINT, datas em DATE, confirmado até ao SQL
[ ] Decidir e documentar ON DELETE (SET NULL vs RESTRICT) antes de implementar delete de conta/dívida/meta
[ ] Backup automático da base de dados (diário, mínimo)

API
[x] Toda rota autenticada corretamente
[x] IDOR não encontrado em accounts/transactions
[x] Bug crítico de auto-transferência corrigido
[ ] Validar limit/offset em GET /transactions
[ ] Tratar exceções não capturadas com respostas 400/500 limpas

FINANCIAL ENGINE
[x] 22 testes a passar, incluindo os 5 bugs da auditoria original + 2 encontrados em uso/auditoria real
[x] Saldo nunca inclui transações futuras nem PENDING/CANCELED
[ ] Alinhar tipos de Debt/Goal/RecurringTransaction com o schema antes de implementar

AUTH
[x] Sessão expira corretamente, proxy + verificação criptográfica em duas camadas
[ ] Mecanismo de revogação de sessão (pode esperar para depois da Beta)

UX
[x] Sem estados quebrados/em branco em nenhuma página
[ ] Botão de ação no EmptyState de "sem contas" (link para /accounts)
[ ] Labels em todos os formulários

RESPONSIVE
[x] Mobile funcional em todas as páginas testadas
[ ] Aumentar alvo de toque de editar/apagar transação

PERFORMANCE
[x] Sem N+1, índice correto na query principal
[x] Confortável a 10-30 utilizadores

DEPLOY
[ ] pool.on('error', ...) na ligação à base de dados
[ ] error.tsx / global-error.tsx
[ ] Endpoint /api/health
[ ] Dockerfile ou processo de deploy documentado
[ ] Logging mínimo (mesmo que só console.error em catch)

BACKUP
[ ] Backup diário automático do Postgres antes de qualquer utilizador real entrar

PRIVACY
[x] Nenhum dado sensível exposto nas respostas da API
[x] .env nunca commitado

TESTING
[x] 22 testes unitários do Financial Engine
[ ] Pelo menos 1 teste de integração de isolamento entre utilizadores (Cenário 10/11)

FEEDBACK
[ ] Nenhum canal de feedback dentro da app ainda (considerar antes ou logo depois do lançamento)
```

## 19. O que precisa ser feito antes do lançamento

Pela ordem de risco real, não de facilidade:

1. Backup automático do Postgres (5.7) — sem isto, um erro apaga permanentemente os dados financeiros de todos os beta users.
2. `pool.on('error', ...)` na ligação à base de dados (5.3) — sem isto, a app crasha por inteiro ao primeiro soluço de rede.
3. Rate limiting em login/registo (5.1) — contas de pessoas reais, hoje sem qualquer proteção contra força bruta.
4. `error.tsx` mínimo + um `console.error`/logger básico nos catches mais importantes (5.4/5.5) — para saberes que algo correu mal antes de um utilizador se queixar.
5. Endpoint `/api/health` (5.6) e decidir onde/como fazer deploy (6.1) — sem isto nem sabes que a app caiu.
6. Verificação de ownership em `categoryId` (6.2) e validação de `limit`/`offset` (6.3) — pequenos, mas fecham as duas últimas lacunas de validação encontradas.

Nenhum destes é grande — juntos, são provavelmente um dia de trabalho focado, não uma semana.

## 20. O que pode esperar

Dívidas, Metas, migração do protótipo, revogação de sessão, sistema de cores por categoria, materialização automática de recorrências, Prisma real, Dockerfile de produção polido, CORS, observabilidade a sério, canal de feedback dentro da app. Nenhum destes reduz risco para os primeiros 10–30 utilizadores; todos podem ser feitos depois de veres feedback real.

## 21. BETA READY / NOT BETA READY

**NOT BETA READY — ainda, mas por uma lista curta e concreta, não por dívida técnica difusa.**

A lógica do produto está correta (depois da correção de hoje), a segurança de acesso a dados está sólida, o código está limpo. O que falta não é "acabar mais coisas" — é a rede de segurança operacional que separa "código correto" de "coisa em que confias com o dinheiro de 10 a 30 pessoas reais": backup, tolerância a falhas de rede da base de dados, e proteção mínima contra força bruta no login. Sem esses três, a pergunta "o que pode correr mal" tem uma resposta desconfortavelmente simples: "a base de dados soluça uma vez, e a app cai; ou alguém tenta adivinhar uma password sem limite; ou o disco falha e não há cópia." Nenhum destes é hipotético para uma aplicação real na internet durante semanas.

Corrige os 6 pontos da secção 19 e isto passa a **BETA READY com limitações aceitáveis** (sem Dívidas/Metas, sem revogação de sessão, sem observabilidade avançada) — limitações que são perfeitamente razoáveis para uma primeira Beta pequena.

## 22. Próximo Milestone

Depois dos 6 pontos da secção 19: lançar a Beta a um grupo pequeno primeiro (2-3 pessoas de confiança antes dos 10-30), confirmar que o fluxo completo (registo → uso real → nenhum susto) aguenta uso real por alguns dias, e só depois abrir para o grupo maior. Dívidas e Metas ficam como o milestone de produto a seguir à Beta, não antes dela.
