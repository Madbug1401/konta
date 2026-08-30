import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { addValuation, listValuations } from "@/lib/db/investments";
import { withErrorHandling } from "@/lib/api-error";

export const GET = withErrorHandling(
  "api.accounts.[id].valuations.get",
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await params;
    const valuations = await listValuations(session.userId, id);
    return NextResponse.json({ valuations: valuations.map((v) => ({ ...v, valueMinor: v.valueMinor.toString() })) });
  },
);

// [Fase 5 — Investimentos] Sem limite superior de negócio de propósito
// (mesmo princípio já usado em accounts/route.ts e transactions/route.ts) —
// só o limite técnico de precisão do BIGINT/JSON. `valueMinor` pode ser 0
// (um investimento pode legitimamente valer zero), nunca negativo.
const AddValuationSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  valueMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

export const POST = withErrorHandling(
  "api.accounts.[id].valuations.post",
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = AddValuationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });
    }

    const valuation = await addValuation(session.userId, id, { date: parsed.data.date, valueMinor: BigInt(parsed.data.valueMinor) });
    if (!valuation) return NextResponse.json({ error: "Ainda não existe detalhe de investimento para esta conta." }, { status: 404 });

    return NextResponse.json({ ...valuation, valueMinor: valuation.valueMinor.toString() }, { status: 201 });
  },
);
