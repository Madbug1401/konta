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

**7 tools da V1**: `get_accounts`, `get_transactions`, `get_debts`, `get_goals` (LOW); `create_transaction`, `update_transaction`, `delete_transaction` (HIGH). `delete_transaction` reutiliza exatamente `deleteTransaction()` (eliminação física, ownership-scoped) — Transaction não tem arquivamento, ao contrário de Account, e esta tool não inventa um.

**Ainda não construído** (documentado, não escondido): `AiActionLog` persistente; tool `get_categories` (torna `categoryId`/`goalId` em `create_transaction` pouco úteis para o modelo até existir uma forma de descobrir ids válidos); mais do que uma ação a exigir confirmação no mesmo turno (a conversa termina com um erro claro em vez de encadear).

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

**Ainda não construído**: `get_categories`, memória persistente entre
sessões, resposta em voz (fora de âmbito por desenho — ver Milestone 5c,
"Voice Input", nunca "Voice Assistant").

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
