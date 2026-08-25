import { EmptyState } from "@/components/ui/empty-state";

// Ver nota em src/app/(app)/debts/page.tsx — mesmo raciocínio para Metas.
export default function GoalsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-bold text-foreground">Metas</h1>
      <EmptyState
        title="Em construção"
        description="O modelo de metas múltiplas (Goal ligada a uma conta dedicada) já está definido no schema — a interface chega no próximo milestone."
      />
    </div>
  );
}
