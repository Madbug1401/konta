import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { createInvestmentDetail, getInvestmentDetailByAccountId, updateInvestmentDetail } from "@/lib/db/investments";
import { withErrorHandling } from "@/lib/api-error";

export const GET = withErrorHandling(
  "api.accounts.[id].investment-detail.get",
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await params;
    const detail = await getInvestmentDetailByAccountId(session.userId, id);
    if (!detail) return NextResponse.json({ error: "Detalhe de investimento não encontrado." }, { status: 404 });

    return NextResponse.json(detail);
  },
);

const InvestmentDetailSchema = z.object({
  investmentType: z.string().trim().min(1).max(60),
  expectedReturnRate: z.number().min(0).max(999.999).nullable().optional(),
  maturityDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

export const POST = withErrorHandling(
  "api.accounts.[id].investment-detail.post",
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = InvestmentDetailSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });
    }

    const detail = await createInvestmentDetail(session.userId, id, parsed.data);
    if (!detail) return NextResponse.json({ error: "Conta não encontrada ou não é uma conta de investimento." }, { status: 404 });

    return NextResponse.json(detail, { status: 201 });
  },
);

const UpdateInvestmentDetailSchema = z.object({
  investmentType: z.string().trim().min(1).max(60).optional(),
  expectedReturnRate: z.number().min(0).max(999.999).nullable().optional(),
  maturityDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

export const PATCH = withErrorHandling(
  "api.accounts.[id].investment-detail.patch",
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = UpdateInvestmentDetailSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });
    }

    const updated = await updateInvestmentDetail(session.userId, id, parsed.data);
    if (!updated) return NextResponse.json({ error: "Detalhe de investimento não encontrado." }, { status: 404 });

    return NextResponse.json(updated);
  },
);
