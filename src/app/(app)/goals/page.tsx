import { GoalCard } from "@/components/goal-card";
import { GoalForm } from "@/components/goal-form";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionUser } from "@/lib/auth/session";
import { listAccounts } from "@/lib/db/accounts";
import { listGoals } from "@/lib/db/goals";
import { listAllTransactionsForBalances } from "@/lib/db/transactions";
import { findUserById } from "@/lib/db/users";
import { calculateGoalProjection, daysFromToday, getGoalProgress, getTodayInTimezone, sum } from "@/lib/financial-engine";

const PROJECTION_LOOKBACK_DAYS = 90;

export default async function GoalsPage() {
  const session = await getSessionUser();
  const [user, accounts, goals, transactions] = await Promise.all([
    findUserById(session!.userId),
    listAccounts(session!.userId),
    listGoals(session!.userId),
    listAllTransactionsForBalances(session!.userId),
  ]);
  const timezone = user?.timezone ?? "Atlantic/Cape_Verde";
  const today = getTodayInTimezone(timezone);
  const lookbackStart = daysFromToday(timezone, -PROJECTION_LOOKBACK_DAYS);
  const accountsById = new Map(accounts.map((a) => [a.id, a]));
  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Metas</h1>
        {accounts.length > 0 && <GoalForm accounts={accountOptions} />}
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          title="Precisas de pelo menos uma conta"
          description="Cria primeiro uma conta em Contas — é o saldo dela que mede o progresso de uma meta."
        />
      ) : goals.length === 0 ? (
        <EmptyState
          title="Ainda não tens metas"
          description="Cria uma meta e liga-a a uma conta (ex: uma poupança dedicada) para acompanhares o progresso."
          action={<GoalForm accounts={accountOptions} />}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {goals.map((goal) => {
            const linkedAccount = goal.linkedAccountId ? accountsById.get(goal.linkedAccountId) : undefined;
            const progress = getGoalProgress(goal, linkedAccount, transactions, today);

            // [Correção — implementação da interface de Metas] Contribuição
            // = soma das transações marcadas com este goalId nos últimos
            // PROJECTION_LOOKBACK_DAYS dias — o rótulo opcional que o
            // formulário de Transações agora permite escolher. Sem nenhuma
            // transação marcada ainda, `calculateGoalProjection` já devolve
            // `null` em vez de inventar uma data (não há dados para
            // extrapolar um ritmo).
            const contributionsLastPeriodMinor = sum(
              transactions
                .filter((t) => t.goalId === goal.id && t.date >= lookbackStart && t.date <= today)
                .map((t) => t.amountMinor),
            );
            const projection = calculateGoalProjection(
              goal,
              progress.currentAmountMinor,
              contributionsLastPeriodMinor,
              PROJECTION_LOOKBACK_DAYS,
              today,
            );

            return (
              <GoalCard
                key={goal.id}
                name={goal.name}
                description={goal.description}
                currency={goal.currency}
                status={goal.status}
                targetDate={goal.targetDate}
                currentAmountMinor={progress.currentAmountMinor}
                targetAmountMinor={progress.targetAmountMinor}
                progressPercent={progress.progressPercent}
                projection={projection}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
