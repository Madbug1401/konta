# Migração do protótipo (localStorage) para o Konta

O protótipo (`index (4).html`) guarda tudo em dois valores do `localStorage`
do browser:

- `financeEvents` — array de eventos: `{ id, date, title, amount, type,
  status?, investmentType?, interestRate?, maturityDate? }`
- `financeSettings` — `{ savingsTarget, savingsMonths, investmentTarget,
  emergencyMin, incomeTarget }`

Nada disto é apagado nem substituído sem plano — esta é a estratégia de
migração (regra 22 do briefing).

## 1. Exportar os dados do protótipo

No browser onde o protótipo foi usado, na consola de DevTools:

```js
copy(JSON.stringify({
  events: JSON.parse(localStorage.getItem('financeEvents') || '[]'),
  settings: JSON.parse(localStorage.getItem('financeSettings') || '{}'),
}));
```

Isto copia um JSON para a área de transferência — cola-o num ficheiro
`prototype-export.json`.

## 2. Mapeamento de campos

| Campo do protótipo | Onde vai no Konta | Notas |
|---|---|---|
| `type: "income"` | `Transaction.type = INCOME`, conta destino = "Banco" (a criar) | Sem conta explícita no protótipo — todas as receitas assumem-se na conta principal. |
| `type: "essential" \| "leisure" \| "others" \| "fixed"` | `Transaction.type = EXPENSE`, `Category` correspondente | Mapeamento direto 1:1 de categoria (ver tabela de categorias abaixo). |
| `type: "debt"` | `Debt` + `DebtInstallment` | Eventos com o mesmo `title` a menos do sufixo `" Parcela N"` são agrupados numa única `Debt`; cada evento vira uma `DebtInstallment`. `status: "paid"` → `DebtInstallment.status = PAID` e gera a `Transaction` de pagamento correspondente; `"pending"` → `PENDING`. |
| `type: "savings"` | `Transaction.type = TRANSFER` para uma conta `Account(type=SAVINGS)` criada na migração | `financeSettings.savingsTarget`/`savingsMonths` → `Goal` ligada a essa conta. |
| `type: "investment"` | `Transaction.type = TRANSFER` para `Account(type=INVESTMENT)` + `InvestmentDetail` | `investmentType`, `interestRate`, `maturityDate` do evento migram para `InvestmentDetail`. **Importante**: o protótipo não distinguia capital de rentabilidade (era o bug da auditoria) — a migração NÃO gera nenhuma `InvestmentValuation` fictícia; o utilizador terá de registar uma avaliação atual manualmente após a migração, ou a UI mostra "sem avaliação registada", nunca um número inventado. |
| `type: "emergency"` | `Transaction.type = TRANSFER` para `Account(type=EMERGENCY_FUND)` | Valores negativos no protótipo (levantamentos, afetados pelo bug de `Math.abs`) tornam-se `TRANSFER` na direção inversa (do cofre para o banco) — a migração corrige a semântica, não a replica. `financeSettings.emergencyMin` não tem equivalente direto ainda (é um "saldo mínimo recomendado" sem entidade própria); fica anotado como dado a rever manualmente após a migração. |
| `id` (`event_N_timestamp`) | descartado, novo `cuid()` gerado | O formato antigo não é estável nem único o suficiente para ser reaproveitado como chave primária. |
| Séries recorrentes (tituladas por convenção, ex: `"Parcela 1"`, `"Parcela 2"`) | `RecurringTransaction` reconstruída a partir do padrão + `DebtInstallment.sequence` | O protótipo não tinha um id de série (era o bug 5 da auditoria) — a migração precisa de agrupar heuristicamente por título-base + tipo + valor da parcela, e o resultado deve ser **revisto manualmente** antes de confirmar, porque a heurística pode juntar por engano duas séries distintas com nomes coincidentes (o mesmo risco documentado na auditoria original). |

### Categorias de sistema usadas na migração

`essential → "Compras"/"Alimentação"` (o protótipo não distinguia — mapear
para "Outros" por omissão e deixar o utilizador reclassificar),
`leisure → "Lazer"`, `fixed → "Renda / Casa"`, `others → "Outros"`.

## 3. Contas criadas automaticamente na migração

Como o protótipo não tinha o conceito de conta, a migração cria, uma vez por
utilizador:

1. `Banco` (`BANK`) — recebe todas as `income`/`essential`/`leisure`/`others`/`fixed`.
2. `Poupança` (`SAVINGS`) — destino das `TRANSFER` de `savings`.
3. `Investimentos` (`INVESTMENT`) — destino das `TRANSFER` de `investment`.
4. `Cofre de Emergência` (`EMERGENCY_FUND`) — destino/origem das `TRANSFER` de `emergency`.

O utilizador pode depois renomear ou dividir estas contas.

## 4. Como correr

Este milestone entrega o *desenho* da migração e o mapeamento de campos —
não um script de produção com tratamento de todos os casos extremos, para
não gastar esforço em algo que só corre uma vez por utilizador e que
beneficia de revisão manual (regra 15: não implementar só para "parecer
completo"). O próximo milestone que tocar em migração deve:

1. Ler `prototype-export.json`.
2. Aplicar as regras acima para gerar `Account`, `Category` (ligar às de
   sistema), `Transaction`, `Debt`+`DebtInstallment`, `Goal`.
3. Mostrar um resumo ("N transações, M dívidas, X metas detetadas") **antes**
   de gravar, para o utilizador confirmar — nunca migrar silenciosamente.
4. Gravar tudo dentro de uma única transação de base de dados, para que uma
   falha a meio não deixe dados parcialmente migrados.
