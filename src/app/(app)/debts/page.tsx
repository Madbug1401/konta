import { EmptyState } from "@/components/ui/empty-state";

// [Regra 15 do briefing — "não implementar funcionalidades apenas para
// parecer completo"] O modelo de dados de Dívidas (Debt + DebtInstallment,
// ver prisma/schema.prisma) já está desenhado e resolve diretamente o bug de
// validação de parcelas da auditoria. A interface de gestão de dívidas fica
// para o próximo milestone — esta página existe para o link de navegação não
// ficar morto, não para fingir uma funcionalidade que ainda não existe.
export default function DebtsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-bold text-foreground">Dívidas</h1>
      <EmptyState
        title="Em construção"
        description="O modelo de dívidas (credor, juros, plano de parcelas) já está definido no schema — a interface chega no próximo milestone."
      />
    </div>
  );
}
