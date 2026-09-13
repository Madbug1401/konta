# Konta — Visão geral da arquitetura (Milestone 0–4)

## Estrutura de pastas

```
konta/
├── prisma/
│   ├── schema.prisma           # fonte de verdade do modelo de dados
│   └── manual-sql/             # SQL equivalente, só necessário neste sandbox (ver DECISIONS.md)
├── src/
│   ├── app/
│   │   ├── (auth)/login, register        # páginas públicas
│   │   ├── (app)/dashboard, transactions,
│   │   │         accounts, debts, goals  # páginas autenticadas (protegidas por middleware.ts)
│   │   └── api/
│   │       ├── auth/{register,login,logout,me}
│   │       ├── accounts
│   │       ├── transactions[, /[id]]
│   │       └── categories
│   ├── components/
│   │   ├── ui/                 # design system genérico (Button, Card, Input, Badge, EmptyState, Skeleton)
│   │   └── *.tsx                # componentes de domínio (AccountCard, TransactionItem, MoneyDisplay, AppShell, formulários)
│   ├── lib/
│   │   ├── financial-engine/   # lógica financeira pura, sem DB nem UI (ver abaixo)
│   │   ├── db/                 # acesso a dados (hoje via `pg`, ver DECISIONS.md)
│   │   └── auth/               # password hashing + sessão JWT
│   └── middleware.ts           # 1ª linha de defesa das rotas autenticadas
└── docs/architecture/          # este documento + DECISIONS.md + MIGRATION.md
```

## Modelo Web + API (por que não é "site com API à parte")

Web e o futuro Mobile consomem os mesmos endpoints REST em `src/app/api/**`.
Os Server Components da Web (ex: `dashboard/page.tsx`) chamam diretamente as
funções de `src/lib/db` e `src/lib/financial-engine` — não fazem um pedido
HTTP a si mesmos — por eficiência (evita uma volta de rede desnecessária
dentro do mesmo processo). As rotas de API fazem exatamente a mesma chamada.
Isto garante que **não existem duas implementações da mesma regra
financeira**: há uma única, em `src/lib/financial-engine`, chamada a partir
de dois pontos de entrada (RSC e rota HTTP). O Konta Mobile, mais tarde, usa
só o segundo ponto de entrada.

## Superfície da API

| Rota | Métodos | Autenticação | Descrição |
|---|---|---|---|
| `/api/auth/register` | POST | — | Cria utilizador, devolve cookie de sessão |
| `/api/auth/login` | POST | — | Autentica, devolve cookie de sessão |
| `/api/auth/logout` | POST | sessão | Invalida o cookie |
| `/api/auth/me` | GET | sessão | Dados do utilizador autenticado |
| `/api/accounts` | GET, POST | sessão | Lista contas (com saldo calculado) / cria conta |
| `/api/accounts/:id` | GET, PATCH, DELETE | sessão | Detalhe, edição; remoção só se a conta nunca foi usada (ver `DELETE_POLICY.md`) |
| `/api/accounts/:id/archive` | POST | sessão | Arquiva/desarquiva a conta (soft-delete) |
| `/api/accounts/:id/investment-detail` | GET, POST, PATCH | sessão | Detalhe de investimento associado à conta |
| `/api/accounts/:id/valuations` | GET, POST | sessão | Histórico de avaliações do investimento |
| `/api/transactions` | GET, POST | sessão | Lista (com filtros) / cria transação |
| `/api/transactions/:id` | GET, PATCH, DELETE | sessão | Detalhe, edição, remoção — sempre com verificação de posse |
| `/api/categories` | GET, POST | sessão | Categorias de sistema + do utilizador |
| `/api/debts` | GET, POST | sessão | Lista dívidas (com parcelas) / cria dívida com plano de parcelas |
| `/api/debts/:debtId` | GET, PATCH | sessão | Detalhe, edição |
| `/api/debts/:debtId/default` | POST | sessão | Marca a dívida como incumprida |
| `/api/debts/:debtId/installments/:installmentId/pay` | POST | sessão | Regista o pagamento de uma parcela |
| `/api/goals` | GET, POST | sessão | Lista metas / cria meta |
| `/api/goals/:id` | GET, PATCH | sessão | Detalhe, edição |
| `/api/goals/:id/status` | POST | sessão | Atualiza o estado da meta (ativa/alcançada/abandonada) |
| `/api/recurring-transactions` | GET, POST | sessão | Lista séries recorrentes / cria série |
| `/api/recurring-transactions/:id` | GET, PATCH | sessão | Detalhe, edição |
| `/api/feedback` | POST | sessão | Envia feedback do utilizador autenticado |
| `/api/health` | GET | — | Healthcheck de infraestrutura (processo + ligação à base de dados) |
| `/api/ai/chat` | POST | sessão | **Milestone 1 — Konta AI.** Mensagem de texto livre → resposta do Claude, sem tools nem contexto financeiro. Ver `src/lib/ai/gateway.ts` e `docs/konta-ai-design.html`. |

Autenticação: cookie `konta_session` (httpOnly) para a Web, ou
`Authorization: Bearer <token>` para clientes não-browser (mobile) — ver
`src/lib/auth/session.ts`.

## Financial Engine (`src/lib/financial-engine`)

Módulo puro (sem imports de `@prisma/client`, `pg` ou React) — recebe dados
já carregados e devolve resultados calculados. Testado com Vitest, incluindo
regressão explícita dos 5 bugs da auditoria (`audit-regressions.test.ts`).

| Ficheiro | Funções principais |
|---|---|
| `money.ts` | `splitIntoInstallments`, `installmentsMatchTotal`, `formatMinor`, `sum`, `abs` |
| `datetime.ts` | `getTodayInTimezone`, `getMonthBounds`/`getPreviousMonthBounds`/`getQuarterBounds`/`getYearBounds`/`getWeekBounds`, `addRecurrenceInterval` |
| `balance.ts` | `getAccountBalance`, `getNetWorth`, `getAvailableBalance` |
| `cashflow.ts` | `getIncomeTotal`, `getExpenseTotal`, `getCashflow`, `getSavingsRate`, `getCategoryBreakdown` |
| `debts.ts` | `generateInstallmentPlan`, `getDebtRemaining`, `getUpcomingInstallments`, `getOverdueInstallments` |
| `recurring.ts` | `getOccurrencesOfSeries`, `computeNextRunDate`, `advanceSeries` |
| `goals.ts` | `getGoalProgress`, `calculateGoalProjection` |
| `investments.ts` | `computeInvestmentPerformance` |

## Konta AI (`src/lib/ai`)

Especificação completa em `docs/konta-ai-design.html`. Implementado até agora:

| Ficheiro/diretório | Responsabilidade | Milestone |
|---|---|---|
| `gateway.ts` | Único módulo autorizado a falar com a API da Anthropic. Evoluiu no Milestone 4 de "uma mensagem, sem tools" para `sendChatTurn()` — um turno com system prompt, histórico e tools; o CONTROLO do loop (quantas vezes chamar, quando parar) vive em `chat/orchestrator.ts`, nunca aqui. | 1, 4 |
| `context/` | Context Builder — transforma dados do utilizador autenticado num DTO orientado a IA (`AiContext`), nos modos `light`/`full`/`directed`. Consome só funções de domínio já existentes (`src/lib/db`, `src/lib/financial-engine`); nunca serializa um record de base de dados em bruto. Ligado ao chat desde o Milestone 4 (modo `light` por omissão) via `chat/orchestrator.ts`. `builder.ts` é o ponto de entrada (`buildAiContext`); `collect.ts` (I/O) é interno; `normalize.ts` também expõe `buildDebtSummaries`/`buildGoalSummaries`/`buildTransactionSummaries` para reutilização pelas tools (Milestone 3/4). | 2 |
| `tools/` | Tool Registry + Permission/Risk Layer + Tool Executor + Confirmation Store — ver detalhe abaixo. Ligado ao Claude desde o Milestone 4 via `tools/anthropic-adapter.ts`. | 3, 4 |
| `chat/` | Orquestrador do loop de tool-calling, Personality Layer e apresentação do contexto em texto — ver secção "Konta AI Chat" abaixo. | 4 |

### Tool Registry, Permission Layer e Executor (`src/lib/ai/tools`, Milestone 3)

Prepara o troço `Claude → Tool Registry → Permission/Risk Layer → Tool Executor → Financial Engine/Backend → DB` da arquitetura-alvo (`docs/konta-ai-design.html`, secções D/E/F) — sem ainda ligar o Claude a nada disto.

**Tool contract** (`types.ts`) — cada tool em `tools/tools/*.ts` é um objeto `AiTool<TParams, TResult>`:

| Campo | Papel |
|---|---|
| `name`/`description` | identidade da tool, o texto que um futuro tool-use do Claude veria |
| `paramsSchema` | Zod — sempre que existe um schema equivalente numa rota HTTP (`create_transaction`/`update_transaction`), é literalmente o mesmo, reexportado da rota, nunca redefinido |
| `riskTier` | metadado estático da própria tool — nunca lido de `params`, nunca escolhido pelo modelo |
| `summarize(params)` | síncrono, só com `params` já validados — a frase de confirmação |
| `execute(userId, params)` | chama diretamente a função de domínio existente (`src/lib/db`, ou `buildDebtSummaries`/`buildGoalSummaries` do Context Builder); nunca SQL novo, nunca recalcula o que o Financial Engine já calcula |

`getTool(name)`/`listTools()` (`registry.ts`) são a única fonte de verdade das tools disponíveis — falha no arranque se dois nomes colidirem.

**Risk Tiers** (`RISK_TIERS`, `types.ts`) — `LOW`/`MEDIUM`/`HIGH`/`CRITICAL`, união de literais (mesmo padrão de `AccountType`/`ContextDomain`), nunca strings soltas. Política V1 (`permissions.ts`, `evaluatePermission`), exatamente como a secção F do design:

| Tier | Decisão da Permission Layer |
|---|---|
| `LOW` | `allowed: true, requiresConfirmation: false` — executa sempre |
| `MEDIUM` | `allowed: true, requiresConfirmation: true` — "tratado como HIGH nesta fase" (nenhuma das 7 tools da V1 é MEDIUM; o caso existe na arquitetura para quando isso mudar) |
| `HIGH` | `allowed: true, requiresConfirmation: true` — toda escrita financeira; sem exceção, sem "force execute" |
| `CRITICAL` | `allowed: false` — recusado antes de sequer propor; nenhuma tool da V1 é CRITICAL |

**Tool Executor** (`executor.ts`) — `executeTool(toolName, userId, rawParams)`: procura a tool no Registry → valida `rawParams` com `paramsSchema` → pede a decisão à Permission Layer (com `tool.summarize(params)` já calculado) → LOW executa já; HIGH/MEDIUM devolve `confirmation_required` (com os `params` validados, nunca executa aqui) → CRITICAL devolve `rejected`. Passa sempre `userId` como argumento explícito a `execute` (nunca lido de `params`, que nenhuma tool desta V1 sequer aceita). Resultado sempre tipado (`ToolExecutionResult`: `not_found`/`invalid_params`/`rejected`/`confirmation_required`/`executed`/`execution_failed`) — nunca uma exceção para os casos esperados.

**Confirmation Store** (`confirmation-store.ts`, Milestone 4) — corrige a limitação identificada no relatório do Milestone 3 (um boolean `confirmed` não amarrava a confirmação aos parâmetros exatos). `createConfirmation()` guarda, num `Map` em memória (mesmo padrão de `src/lib/rate-limit.ts` — nunca persistido, nunca sobrevive a um restart), um token opaco de 256 bits ligado a: utilizador, os `toolCalls` exatos (nunca reconstruídos a partir de um novo pedido do cliente), expiração de 5 minutos, e estado `pending`/`consumed`/`cancelled` (uso único). `consumeConfirmation()`/`cancelConfirmation()` verificam ownership (token de outro utilizador devolve o mesmo "not_found" genérico — anti-enumeração) antes de aceitar. `executeConfirmedTool()` (`executor.ts`) executa uma tool já confirmada, revalidando o schema e recusando sempre CRITICAL como defesa em profundidade.

**7 tools da V1** (Milestone 3): `get_accounts`, `get_transactions`, `get_debts`, `get_goals` (LOW); `create_transaction`, `update_transaction`, `delete_transaction` (HIGH). `delete_transaction` reutiliza exatamente `deleteTransaction()` (eliminação física, ownership-scoped) — Transaction não tem arquivamento, ao contrário de Account, e esta tool não inventa um. Desde o Milestone 6, o Registry tem 27 tools no total — ver secção "Konta AI — Cobertura Completa" abaixo para a lista e a matriz de capacidades.

**Ainda não construído** (documentado, não escondido): `AiActionLog` persistente; mais do que uma ação a exigir confirmação no mesmo turno já funciona desde o Milestone 5b (confirmação agrupada) — o que falta é memória persistente entre sessões e streaming de resposta.

## Konta AI Chat — primeira experiência real (`src/lib/ai/chat`, `/assistant`, Milestone 4)

Liga, pela primeira vez, o AI Gateway ao Context Builder e ao Tool Registry: `User → /assistant (UI) → POST /api/ai/chat → Context Builder (light) → AI Gateway → Claude → Tool Registry → Permission/Risk → (confirmação quando preciso) → Tool Executor → Financial Engine/DB → resposta`.

- **`chat/personality.ts`** — Personality Layer: um prompt curto e explícito (nunca um prompt gigante), separado da lógica técnica. Define identidade, e as regras que o Claude nunca quebra (nunca inventar números, nunca dizer que uma ação foi feita antes do resultado `executed`, nunca contornar uma permissão, nunca revelar detalhes internos).
- **`chat/context-presentation.ts`** — o passo de serialização que o Context Builder (Milestone 2) deixou deliberadamente por fazer: converte um `AiContext` em texto determinístico para o system prompt. Nunca inclui um campo que o `AiContext` não tenha.
- **`chat/orchestrator.ts`** — dono do loop de tool-calling (o Gateway só sabe fazer uma chamada de cada vez). `sendMessage()`: constrói contexto `light`, chama `sendChatTurn()`, e avalia TODOS os `tool_use` que o Claude pedir no mesmo turno — LOW continua o loop automaticamente; todos os que exigirem confirmação entram juntos numa ÚNICA entrada do Confirmation Store (confirmação agrupada, ver secção "Konta AI Multimodal" abaixo), devolvendo um token só. `confirmPendingAction()`/`cancelPendingAction()` retomam ou cancelam o grupo inteiro a partir desse token. Limite de `MAX_TOOL_ROUNDS = 5` por pedido — ao atingir, para com uma resposta segura em vez de continuar indefinidamente.
- **`POST /api/ai/chat`** — três ações (`message`/`confirm`/`cancel`), validadas com Zod (`z.discriminatedUnion`); sessão obrigatória, `userId` nunca do corpo; histórico de conversa gerido pelo cliente (sem memória persistida — texto simples, máx. 20 turnos, máx. 4000 carateres cada); rate limit básico por utilizador (`src/lib/rate-limit.ts` reutilizado, 20 pedidos/10min — nunca billing a sério, documentado como próximo passo).
- **`src/components/chat-panel.tsx`** (`/assistant`, entrada "Konta AI" na navegação) — mensagens, sugestões iniciais, estado de confirmação com botões Confirmar/Cancelar, loading e erro. Sem infraestrutura de teste de componentes React neste projeto (Vitest corre em ambiente `node`, sem `@testing-library/react`) — verificado por typecheck/lint, não por teste automatizado; ver relatório do Milestone 4 para o roteiro de teste manual.

**Ainda não construído** (documentado, não escondido): memória persistente entre sessões, `get_categories`, streaming, voz, notificações proativas — todos deliberadamente fora do âmbito desta primeira experiência.

## Konta AI Multimodal — attachments, extração e propostas (Milestone 5a/5b)

Adiciona imagens/PDF/TXT/CSV como input do chat (5a) e entendimento
financeiro real desses attachments (5b) — sem criar nenhuma segunda
arquitetura de IA, de escrita, ou de confirmação.

- **`src/lib/ai/attachments/`** (5a) — validação por conteúdo real (nunca
  MIME/extensão do cliente), limites, Attachment Store em memória com TTL
  (mesmo padrão do Confirmation Store), contagem de páginas de PDF
  (`pdf-lib`). `POST /api/ai/attachments` faz o upload; imagem/PDF vão para
  a Anthropic Files API (`gateway.ts::uploadFileToAnthropic`), TXT/CSV
  ficam inline como texto.
- **`chat/attachments.ts`** (5a) — resolve `attachmentIds` (sempre
  ownership-scoped) para blocos `image`/`document` do Gateway. Texto de
  TXT/CSV é envolvido numa boundary aleatória de 128 bits, gerada por
  chamada (`wrapUntrustedText`) — nunca uma tag fixa, para nenhum ficheiro
  a poder reproduzir e "fechar" a fronteira mais cedo (correção de
  segurança M5a.1, com testes dedicados ao ataque).
- **`tools/tools/propose-transactions.ts`** (5b, LOW) — o único sítio que
  entende extração financeira: recebe do Claude uma lista de transações
  extraídas (nomes em texto livre, nunca ids — `.strict()` rejeita
  `accountId`/`categoryId`/`confirmed` inventados), resolve `account`
  contra as contas reais do utilizador (0 correspondências ou mais do que
  1 ficam por resolver, nunca uma escolha arbitrária), verifica moeda/data
  impossíveis, e sinaliza possíveis duplicados (mesma conta/tipo/data/valor
  já existente) — nunca escreve nada. `category` passa tal e qual para
  `create_transaction`, que já sabe resolvê-la (Milestone 3). Limite de
  `MAX_EXTRACTED_TRANSACTIONS = 20` por chamada.
- **Confirmação agrupada** (5b, `chat/orchestrator.ts`) — quando o mesmo
  turno tem várias tools a exigir confirmação (tipicamente N chamadas a
  `create_transaction`, uma por transação extraída), entram todas juntas
  numa única `PendingConfirmation`, com um resumo combinado e numerado. Ao
  confirmar, `executeConfirmedTool` corre uma vez por ação, sequencialmente
  — sem fingir atomicidade que o executor não tem: uma falha a meio nunca
  impede nem esconde o sucesso das outras (`"3 adicionadas, 1 falhou"` é um
  resultado válido, nunca mascarado). Substitui a política do Milestone 4
  ("para na primeira, as outras ficam bloqueadas").
- **`create_transaction`** ganhou um campo opcional `accountName`
  (Milestone 5b) — só cosmético, só para o texto de confirmação mostrar em
  que conta a transação vai ficar; nunca influencia a escrita real (isso
  continua a ser sempre `accountId`, verificado por ownership).

- **`src/lib/ai/transcription/`** (Milestone 5c, Voz) — `POST
  /api/ai/transcription` (sessão + `isAiEnabled` + rate limit próprio +
  validação de conteúdo real do áudio, mesma filosofia do 5a: assinatura
  binária, nunca o MIME do browser — só WebM/Opus e MP4/AAC, os dois
  formatos que os browsers realmente produzem via `MediaRecorder`) →
  `transcribeAudio()` (Groq, Whisper `large-v3-turbo`, único ficheiro
  autorizado a falar com essa API — mesma disciplina de isolamento do
  `gateway.ts`) → devolve só texto. **A transcrição nunca é um attachment**:
  ao contrário de imagem/PDF, não fica em nenhum store, não tem id, não
  sobrevive ao pedido HTTP — o cliente recebe o texto e o utilizador
  revê/edita no composer antes de enviar, exatamente como uma mensagem
  escrita à mão. `src/components/use-audio-recorder.ts` (hook,
  `MediaRecorder` nativo) é o único ficheiro do frontend que sabe gravar
  áudio; o `ChatPanel` só conhece `start()`/`stop()`/`cancel()`, nunca a API
  da Groq. Sem alterações ao Financial Engine, Tool Registry, Permission
  Layer ou Confirmation Store — a transcrição entra no chat pelo mesmo
  campo `message` de sempre.

**Ainda não construído**: memória persistente entre sessões, resposta em voz
(fora de âmbito por desenho — ver Milestone 5c, "Voice Input", nunca "Voice
Assistant").

## Konta AI — Cobertura Completa (Milestone 6)

Objetivo: se o utilizador consegue fazer uma operação financeira pela UI, o
Konta AI consegue fazer a mesma operação pela conversa — sempre pela MESMA
pilha (`Claude → Tool Registry → Permission Layer → função de domínio já
usada pela UI → Financial Engine → DB`), nunca uma segunda lógica financeira,
de permissões ou de confirmação. Nenhuma tool desta milestone introduziu SQL
novo — todas chamam uma função já existente em `src/lib/db/*.ts`, a mesma
que a rota HTTP equivalente já chamava.

**19 tools novas** (Registry passa de 8 para 27 — ver `registry.ts`):

| Domínio | LOW (leitura) | HIGH (escrita) |
|---|---|---|
| Contas | (já existia: `get_accounts`) | `create_account`, `update_account`, `set_account_archived`, `delete_account` |
| Dívidas | `get_debts` (agora com `id` da dívida e de cada parcela — antes só alimentava texto do prompt) | `create_debt`, `update_debt`, `pay_debt_installment`, `mark_debt_defaulted` |
| Metas | `get_goals` (agora com `id` e `linkedAccountId`) | `create_goal`, `update_goal`, `update_goal_status` |
| Recorrências | `get_recurring_transactions` (novo) | `create_recurring_transaction`, `set_recurring_transaction_active` |
| Investimentos | `get_investments` (novo) | `create_investment_detail`, `update_investment_detail`, `add_investment_valuation` |
| Categorias | `get_categories` (novo) | — (criar categoria já acontece transparentemente dentro de `create_transaction`/`create_recurring_transaction` via `resolveCategoryByName`; uma tool própria seria redundante) |

**Decisões de arquitetura desta milestone:**

- **DTOs com `id` para as tools de escrita** (`shared.ts`: `AiToolDebt`, `AiToolGoal`, `AiToolRecurringTransaction`, `AiToolInvestment`, `AiToolCategory`) — diferente dos DTOs do Context Builder (`AiDebtSummary`/`AiGoalSummary`, que nunca expõem `id` porque só alimentam texto do system prompt). `get_debts`/`get_goals` passaram a usar os novos DTOs; o Context Builder e o texto do system prompt (`context-presentation.ts`) não foram tocados. Mesmos cálculos do Financial Engine em ambos os casos (`getDebtRemaining`, `getGoalProgress`, `calculateGoalProjection`, `computeInvestmentPerformance`) — nunca reimplementados.
- **Contribuir/retirar de uma meta nunca é uma tool própria** — é sempre `create_transaction` (já existente) contra `linkedAccountId` da meta, com `goalId` preenchido. `create_transaction` já suportava `goalId` desde o Milestone 3; só faltava `get_goals` expor o `linkedAccountId` para o modelo poder montar a chamada.
- **`mark_debt_defaulted` ≠ "marcar como paga"** — marca INCUMPRIMENTO (irreversível); uma dívida fica paga sozinha via `pay_debt_installment` quando a última parcela é paga. Documentado explicitamente na descrição da tool e em `personality.ts` para o Claude nunca confundir os dois.
- **Sem tool de eliminar dívida, meta ou recorrência** — porque a própria aplicação não suporta essa operação (nenhuma rota `DELETE` existe para nenhuma das três). Recorrência só pausa (`set_recurring_transaction_active`); dívida/meta não têm nenhum mecanismo de remoção, só de encerramento de estado (`mark_debt_defaulted`/`update_goal_status`).
- **Nenhuma tool é CRITICAL** — as duas ações irreversíveis novas (`mark_debt_defaulted`, `update_goal_status`) já têm o mesmo guard que a rota HTTP (só transições a partir de `ACTIVE`); `delete_account` só aceita uma conta genuinamente vazia (`AccountNotEmptyError`). Nenhuma tem menos proteção do que a UI manual já tinha.
- **Sem alterações ao Context Builder** — as novas tools são descobertas por chamada explícita (`get_categories`/`get_recurring_transactions`/`get_investments`), nunca despejadas no `light context` por omissão, para não aumentar o custo por mensagem.
- **Gap conhecido, documentado, não escondido**: não existe cálculo de "quanto preciso guardar por mês" para uma meta no Financial Engine — só projeção de data de conclusão ao ritmo atual (`calculateGoalProjection`). O Konta AI nunca inventa esse número; se perguntado, responde com o que existe (progresso, projeção) e diz que não tem essa métrica.

## Konta Analytics — compreensão financeira profunda (`src/lib/analytics`, `/analytics`, Milestone Analytics)

Objetivo: transformar o Konta de "aplicação que mostra dinheiro" em
"aplicação que ajuda a compreender o comportamento financeiro" — sem criar
uma segunda autoridade financeira. Arquitetura de camadas, sempre na mesma
direção:

```
DATABASE → FINANCIAL ENGINE → ANALYTICS → AI TOOLS → CLAUDE → USER
                                   ↕
                            PÁGINA /analytics
```

A página `/analytics` e a Konta AI consomem exatamente a mesma camada
(`src/lib/analytics/*.ts`, funções puras) — nunca duas implementações da
lógica financeira. Nenhum ficheiro faz I/O exceto `dataset.ts`
(`collectAnalyticsDataset(userId)`, ownership-scoped, reutiliza
`listAccounts`/`listAllTransactionsForBalances`/`listCategories`/`listDebts`/
`listGoals`/`listRecurringTransactions`/investimentos — já existentes, nunca
uma query nova). Todos os outros ficheiros (`overview`, `cashflow`,
`categories`, `debts`, `goals`, `recurring`, `investments`, `trends`,
`insights`, `simulations`, `periods`, `compare`, `filters`) recebem esse
dataset já carregado e só calculam, reutilizando sempre
`getIncomeTotal`/`getExpenseTotal`/`getCashflow`/`getCategoryBreakdown`/
`getAccountBalance`/`getDebtRemaining`/`getGoalProgress`/
`calculateGoalProjection`/`computeInvestmentPerformance` do Financial
Engine — nenhuma fórmula financeira nova nesta camada.

**Períodos** (`periods.ts`): 7 presets (`this_month`/`last_month`/
`last_30d`/`last_90d`/`this_year`/`last_year`/`last_12_months`) + `custom`
(validado — nunca aceita `from`/`to` vazios ou mal formados, achado de
auditoria corrigido antes do commit). Comparação (`previous_period`/
`previous_year`/`none`) é "inteligente": um mês de calendário completo
compara sempre com o mês de calendário anterior inteiro (ex: Setembro vs
Agosto, o exemplo do pedido), nunca "mesma duração em dias" quando isso
daria um intervalo que não é o mês anterior; um intervalo arbitrário
(últimos 30/90 dias) usa mesma duração, imediatamente antes. Nunca uma
percentagem de variação quando o período anterior é zero — só a direção.

**Simulações** (`simulations.ts`) — `reduce_category`/`adjust_expenses`/
`increase_goal_contribution` — são puramente analíticas: nunca escrevem na
base de dados, devolvem sempre REAL e SIMULADO lado a lado. Servidas por
`POST /api/analytics/simulate` (formulário "E se…?" na página) e pela tool
`run_financial_simulation` (Konta AI) — a mesma função por baixo.

**10 tools novas** (Registry passa de 27 para 38, todas `LOW`,
READ-ONLY): `get_analytics_overview`, `get_cashflow_analysis`,
`get_category_analysis` (tabela ou drill-down de uma categoria, resolvida
por nome via `resolveCategoryName` — exact match → partial match único →
ambíguo pede esclarecimento, nunca escolhe sozinho), `get_debt_analysis`,
`get_goal_analysis`, `get_recurring_analysis`, `get_investment_analysis`
(nunca sugere compra/venda — o Konta não suporta isso), `get_financial_trends`,
`get_financial_insights` (insights sempre determinísticos, nunca gerados
pelo Claude — `insights.ts` decide o quê e quando, com limiares explícitos,
ex: 15% de variação de categoria), `run_financial_simulation`. Note:
`get_debt_analysis`/`get_goal_analysis` são analíticos (agregados por
período) — não confundir com `get_debts`/`get_goals` (Milestone 6), que
devolvem ids para uma escrita subsequente.

**`set_analytics_view` (LOW) — a Konta AI muda a página, nunca a manipula
diretamente** (secção 25 do pedido): resolve nome de categoria/conta em
texto livre contra dados reais (nunca aceita um id do modelo) e devolve um
`AnalyticsViewAction` — um objeto simples, validado por
`AnalyticsViewActionSchema` (Zod, `.strict()`, isomórfico:
`src/lib/analytics/view-action.ts`) em DOIS sítios independentes: dentro da
própria tool (servidor) e outra vez no cliente
(`assistant-provider.tsx::applyOutcome`, antes de expor
`pendingUiAction`) — nunca confiado só por "vir do servidor". A aplicação
(`AnalyticsUiActionBridge`, client component sem saída visual) é quem
decide aplicar, sempre por `router.push` com query params — nunca `eval`,
`innerHTML`, `localStorage` direto, ou qualquer execução de código vinda da
IA.

**Visualizações declarativas** (`visualization.ts`, `AiVisualizationSchema`)
— `metric`/`comparison`/`table`/`line`/`bar`/`area`/`donut`, também
`.strict()`, tamanho limitado (máx. 60 pontos/50 linhas), valores numéricos
sempre finitos. `get_analytics_overview`/`get_cashflow_analysis`/
`get_category_analysis` anexam uma visualização ao seu resultado; o
orquestrador extrai-a (`orchestrator.ts::extractUiSignals`, revalidando
sempre contra o schema) e o `ChatPanel` desenha-a via `<AiVisualizationView>`
(`src/components/ai-visualization.tsx`, Recharts) — a IA nunca gera
HTML/SVG/JS, só a estrutura de dados; o componente decide sempre como
desenhar.

**Contexto "Ask Konta"** (`chat/analytics-context.ts`) — quando uma
mensagem parte do campo "Pergunte à Konta" da própria página de Análises,
um pequeno DTO (`AnalyticsPageContext`: período/comparação/vista/filtro já
formatados, nunca ids nem dados financeiros em bruto) é anexado ao system
prompt dessa chamada — o utilizador nunca repete o período/filtro já
visível no ecrã. Nunca substitui a obrigação da Konta AI de chamar uma tool
de analytics para números reais.

**Página `/analytics`** — Server Component, filtros geridos por query
string (`?period=last_30d&comparison=previous_year&categoryId=...`,
partilhável/marcável, funciona sem JavaScript, mesmo padrão de
`/transactions`), com: resumo executivo, fluxo de caixa (gráfico +
comparação), categorias (tabela + drill-down por clique, "Voltar à visão
geral"), maiores despesas, dívidas, metas, recorrências, investimentos (só
quando existem), tendências (6 meses, direção crescente/decrescente/
estável — nunca causalidade inventada), insights da Konta AI, e o painel
"E se…?". `AnalyticsUiActionBridge` liga a conversa à URL da página.

**Segurança** — ownership sempre via `collectAnalyticsDataset(userId)`
(userId da sessão, nunca de parâmetros); todos os schemas `.strict()`
(campo desconhecido nunca passa); `run_financial_simulation` e
`set_analytics_view` nunca chamam nenhuma função de escrita (verificado por
teste, incluindo uma leitura do próprio ficheiro-fonte); nenhuma tool desta
área é `HIGH`/`CRITICAL` (não têm efeito financeiro real); Permission
Layer, Confirmation Store e Financial Engine não foram alterados.

**Gap conhecido, documentado, não escondido**: sem tablet/mobile como
layouts visualmente distintos do desktop (usa os mesmos breakpoints
Tailwind responsivos já usados no resto do Konta, mesma decisão de
arquitetura da secção "Estratégia responsive" abaixo); sem sugestões
proativas em botões ("Quer que eu compare...? [Sim] [Não]") — deferido,
documentado no relatório do milestone.

## Design System (`src/components/ui` + componentes de domínio)

Implementados nesta fase: `Button`, `Card`, `Input`, `Badge`, `EmptyState`,
`Skeleton`; `MoneyDisplay`, `AccountCard`, `TransactionItem`, `AppShell`,
`ThemeToggle`, `TransactionForm`, `AccountForm`. Pendentes para o próximo
milestone (só quando as páginas de Dívidas/Metas forem construídas):
`DebtCard`, `GoalCard`, `Dialog`, `Tabs`, `Dropdown`, `Tooltip`, `Toast`,
`Table` genérica, `ChartContainer`.

## Estratégia responsive

Não existe "versão mobile" separada — cada página usa classes Tailwind
responsivas (`sm:`, `md:`, `lg:`) no mesmo JSX. O único ponto onde o layout
muda estruturalmente por breakpoint é a navegação (`AppShell`): sidebar fixa
em `md:` e acima, barra inferior + botão flutuante de "Nova transação" abaixo
de `md:`, ambas geradas a partir da mesma lista `NAV_ITEMS`. Todos os
controlos interativos (botões, inputs, selects) têm `min-height: 2.75rem`
(~44px) globalmente definido em `globals.css`, para touch targets
adequados. As tabelas (ex: lista de transações) usam `overflow-x-auto`
num contentor para nunca partir o layout em ecrãs estreitos.

## O que fica para o próximo milestone

- Geração automática de ocorrências de `RecurringTransaction` (o cálculo de
  `computeNextRunDate`/`advanceSeries` já existe; falta o job/rota que os
  materializa em `Transaction`).
- Script de migração do protótipo executável (o mapeamento está em
  `MIGRATION.md`; falta o script propriamente dito).
- Troca de `src/lib/db/*.ts` para Prisma Client assim que `prisma generate`
  puder correr num ambiente com acesso normal à rede.
