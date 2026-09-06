# Política de eliminação de dados (ON DELETE)

> **Prioridade 10 do Pre-Beta Hardening**, escrita quando nenhuma
> funcionalidade de delete existia ainda — só análise/decisão. **Atualização
> (06/09/2026): `DELETE /api/accounts/[id]` já foi implementado**
> (`deleteAccount()`, `src/lib/db/accounts.ts`), seguindo exatamente a
> política decidida abaixo — ver "O que foi implementado" no fim deste
> documento antes de assumir que a análise original ainda descreve o estado
> atual. Debts, Goals e Recurring Transactions continuam sem nenhuma rota de
> delete.

## Porque é que isto importava antes de existir qualquer botão "eliminar"

Quando este documento foi escrito, a aplicação não tinha nenhuma rota de
delete para Accounts, Debts, Goals ou Recurring Transactions. Mas o schema
da base de dados já definia o que aconteceria *se* essa rota existisse,
através das constraints `ON DELETE` em cada chave estrangeira — e uma dessas
constraints, tal como está, apagaria dados financeiros que o utilizador
precisa de manter. A análise desta secção continua válida; só deixou de ser
verdade a frase "não existe nenhuma rota de delete" para `Account`.

## Levantamento completo: todas as chaves estrangeiras e o seu comportamento ON DELETE

Baseado em `prisma/manual-sql/0001_init.sql` (schema real aplicado):

| Tabela.coluna | Referencia | Comportamento ON DELETE |
|---|---|---|
| `Account.userId` | `User` | `CASCADE` |
| `Category.userId` | `User` | `CASCADE` (coluna nullable) |
| `RecurringTransaction.userId` | `User` | `CASCADE` |
| `RecurringTransaction.accountId` | `Account` | *(nenhuma ação explícita → NO ACTION)* |
| `Debt.userId` | `User` | `CASCADE` |
| `DebtInstallment.debtId` | `Debt` | `CASCADE` |
| `Goal.userId` | `User` | `CASCADE` |
| `Goal.linkedAccountId` | `Account` | *(nenhuma ação explícita → NO ACTION)* |
| `Transaction.userId` | `User` | `CASCADE` |
| **`Transaction.accountId`** | **`Account`** | **`CASCADE`** ⚠️ |
| `Transaction.destinationAccountId` | `Account` | *(nenhuma ação explícita → NO ACTION)* |
| `Transaction.categoryId` | `Category` | *(nenhuma ação explícita → NO ACTION)* |
| `Transaction.debtId` | `Debt` | *(nenhuma ação explícita → NO ACTION)* |
| `Transaction.debtInstallmentId` | `DebtInstallment` | *(nenhuma ação explícita → NO ACTION)* |
| `Transaction.goalId` | `Goal` | *(nenhuma ação explícita → NO ACTION)* |
| `Transaction.recurringTransactionId` | `RecurringTransaction` | *(nenhuma ação explícita → NO ACTION)* |
| `InvestmentDetail.accountId` | `Account` | `CASCADE` |
| `InvestmentValuation.investmentDetailId` | `InvestmentDetail` | `CASCADE` |

`NO ACTION` em Postgres (o comportamento por omissão quando `ON DELETE` não
é especificado) impede o `DELETE` de ser executado enquanto existir alguma
linha a referenciar a linha-alvo — a base de dados recusa a operação com um
erro de foreign key, em vez de apagar ou deixar `NULL`. Na prática, hoje,
isto funciona como uma rede de segurança acidental: tentar apagar uma
`Category`, `Debt`, `Goal` ou `RecurringTransaction` que tenha
`Transaction`s associadas falha imediatamente em vez de destruir histórico
ou corromper dados — apesar de nenhuma destas tabelas ter sido pensada
deliberadamente com essa proteção.

## O problema concreto: `Transaction.accountId ON DELETE CASCADE`

Esta é a constraint identificada no `GO_TO_BETA_AUDIT.md` como bloqueadora.
Ao contrário de todas as outras relações da tabela `Transaction`, esta usa
`CASCADE`: **apagar uma `Account` apaga automaticamente, em cascata, todas
as `Transaction`s cujo `accountId` aponte para essa conta** — mesmo que
essas transações tenham anos de histórico financeiro do utilizador.

Isto é inconsistente com o resto do schema por duas razões:

1. **Assimetria dentro da própria tabela `Transaction`**: uma transferência
   tem `accountId` (conta de origem) e `destinationAccountId` (conta de
   destino). Apagar a conta de origem apaga a transação inteira em cascata;
   apagar a conta de destino da mesma transação seria bloqueado pelo
   Postgres (`NO ACTION`). A mesma linha da tabela `Transaction` tem dois
   comportamentos opostos consoante qual das duas contas é apagada.
2. **Contradiz o princípio geral do resto do schema**: todas as outras
   ligações de `Transaction` a entidades "de negócio" (`Category`, `Debt`,
   `DebtInstallment`, `Goal`, `RecurringTransaction`) protegem a transação
   por omissão (`NO ACTION`). Só a relação com `Account` — provavelmente a
   mais importante de todas, já que toda a transação pertence sempre a uma
   conta — escolhe apagar em vez de proteger.

Numa aplicação de finanças pessoais, uma `Transaction` é o registo de um
acontecimento financeiro real (um pagamento, um depósito, uma
transferência). Perder esse registo porque a conta associada foi arquivada
ou fechada — por exemplo, o utilizador fechou uma conta bancária antiga —
apagaria retroativamente o histórico de receitas/despesas desses meses,
distorcendo relatórios, o cálculo de patrimonio ao longo do tempo, e
qualquer exportação/auditoria futura. Isto é inaceitável para dados
financeiros, mesmo em beta.

## Decisão: arquivamento como via principal; hard-delete de Account só quando genuinamente vazia

Em vez de delete físico incondicional, a política é:

- **Accounts**: já existe no schema o campo `Account.isArchived BOOLEAN NOT
  NULL DEFAULT false`. "Eliminar" uma conta com histórico do ponto de vista
  do utilizador significa marcar `isArchived = true` (deixa de aparecer nas
  listas ativas, deixa de poder receber novas transações — `setAccountArchived()`,
  `src/lib/db/accounts.ts`) — **nunca** um `DELETE FROM "Account"` quando há
  histórico. O histórico de transações associado permanece intacto e
  consultável (ex: para relatórios anuais, exportação, ou caso o utilizador
  queira reativar a conta).
- **Debts, Goals, Recurring Transactions**: nenhuma destas tabelas tem hoje
  um campo de arquivamento equivalente a `isArchived`, nem nenhuma rota de
  delete. Quando a funcionalidade de eliminação for desenhada para estas
  entidades, recomenda-se o mesmo padrão (`Debt.status = PAID_OFF`,
  `Goal.status = ACHIEVED`/`ABANDONED` já cobrem parcialmente "já não está
  ativo" sem apagar nada) em vez de introduzir `DELETE` físico incondicional.
- **Account só é fisicamente apagada quando não tem nenhum histórico** — ver
  "O que foi implementado" abaixo. Continua a valer a regra geral: nenhuma
  operação de delete pode resultar num `DELETE FROM "Account"` que arraste
  histórico em cascata sem que o próprio código verifique isso primeiro (a
  constraint da base de dados, por si só, ainda não impede isto — ver secção
  seguinte).

## Recomendação para uma migração futura (não feita agora)

Quando uma funcionalidade real de "encerrar conta" for construída (fora do
âmbito desta Beta), a migração correta é alterar
`Transaction.accountId` de `ON DELETE CASCADE` para `ON DELETE RESTRICT`
(ou o `NO ACTION` já usado nas colunas irmãs, por consistência) — assim a
base de dados passa a recusar apagar fisicamente uma `Account` que ainda
tenha `Transaction`s associadas, tornando o hard-delete acidental
impossível ao nível da própria base de dados, e não apenas por convenção no
código da aplicação. Esta alteração não é feita agora porque:

- Não existe hoje nenhuma funcionalidade de delete que dependa dela — é uma
  proteção para um caso de uso que ainda não existe na aplicação.
- É uma migração de schema com risco (`ALTER TABLE ... DROP CONSTRAINT` +
  `ADD CONSTRAINT`), e o pedido explícito desta tarefa é apenas
  **documentar a decisão**, não implementar ou migrar nada.
- Faz mais sentido implementá-la no mesmo momento em que a funcionalidade
  de arquivamento de conta for construída, para que o teste de regressão
  cubra as duas coisas juntas (a rota que arquiva a conta e a garantia ao
  nível de base de dados de que um hard-delete nunca destrói histórico).

## O que foi implementado (atualização, 06/09/2026)

`DELETE /api/accounts/[id]` (`src/app/api/accounts/[id]/route.ts`) chama
`deleteAccount(userId, accountId)` (`src/lib/db/accounts.ts`), que:

1. Verifica ownership (`getAccountById(userId, accountId)`), como qualquer
   outra operação sobre `Account`.
2. Antes de apagar, consulta se a conta tem `Transaction` (origem ou
   destino), `Goal` ligada, `RecurringTransaction` (origem ou destino) ou
   `InvestmentDetail`. Se tiver qualquer uma destas, lança
   `AccountNotEmptyError` → `409`, com a mensagem a indicar para arquivar em
   vez de apagar.
3. Só executa `DELETE FROM "Account"` quando **nenhuma** dessas relações
   existe — nesse caso, `ON DELETE CASCADE` em `Transaction.accountId` nunca
   chega a apagar nada em cascata, porque não há nenhuma `Transaction` a
   apagar.

Isto resolve o risco concreto identificado por este documento (perda de
histórico) por verificação aplicativa antes do `DELETE`, sem alterar a
constraint da base de dados. A recomendação da secção anterior — migrar
`Transaction.accountId` para `RESTRICT`/`NO ACTION` como defesa adicional ao
nível da própria base de dados — **continua válida e não foi feita**: hoje a
proteção existe só em `src/lib/db/accounts.ts`; um `DELETE` feito por outro
caminho (script, migração futura, acesso direto à base de dados) ainda
teria o comportamento `CASCADE` sem esta verificação.

## Resumo

| Pergunta | Resposta |
|---|---|
| Existe hoje alguma rota de delete para Account/Debt/Goal/RecurringTransaction? | Só para `Account` (`DELETE /api/accounts/[id]`). Debt/Goal/RecurringTransaction continuam sem nenhuma. |
| O schema atual permite apagar uma Account e perder transações em cascata? | A constraint (`Transaction.accountId ON DELETE CASCADE`) continua tal como estava; o risco é mitigado hoje só pela verificação em `deleteAccount()`, não pelo schema. |
| Foi implementada alguma funcionalidade de delete desde a análise original? | Sim — `deleteAccount()`, restrito a contas sem nenhum histórico (transações, metas, recorrências, investimento). Ver secção acima. |
| Qual é a política para contas com histórico? | Soft-delete/arquivamento (`Account.isArchived`, `setAccountArchived()`), nunca hard-delete. |
| E quanto ao schema em si? | Recomenda-se ainda migrar `Transaction.accountId` para `ON DELETE RESTRICT`/`NO ACTION` como defesa ao nível da base de dados — continua não feito; a proteção atual é só aplicativa. |
