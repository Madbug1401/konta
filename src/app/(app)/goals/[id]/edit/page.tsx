import { notFound } from "next/navigation";
import { GoalEditForm } from "@/components/goal-edit-form";
import { getSessionUser } from "@/lib/auth/session";
import { getGoalById } from "@/lib/db/goals";

export default async function EditGoalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();

  const goal = await getGoalById(session!.userId, id);
  // getGoalById já filtra por userId — mesma proteção de acesso já usada
  // em EditTransactionPage/EditAccountPage/EditDebtPage.
  if (!goal) notFound();

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-xl font-bold text-foreground">Editar meta</h1>
      <GoalEditForm
        goalId={goal.id}
        initialValues={{
          name: goal.name,
          description: goal.description,
          targetAmountMinor: Number(goal.targetAmountMinor),
          targetDate: goal.targetDate,
        }}
      />
    </div>
  );
}
