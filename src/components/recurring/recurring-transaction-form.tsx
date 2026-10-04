"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CategoryQuickCreate, type CreatedCategory } from "@/components/transactions/category-quick-create";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast-provider";
import { getCurrencyDecimalPlaces } from "@/lib/currencies";
import type { RecurrenceFrequency, TransactionType } from "@/lib/financial-engine";
import { convertByExchangeRate, fromMinor, toMinor } from "@/lib/financial-engine/money";

export interface RecurringTransactionFormAccount {
  id: string;
  name: string;
  currency: string;
}
export interface RecurringTransactionFormCategory {
  id: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
}

const FREQUENCY_OPTIONS: { value: RecurrenceFrequency; label: string }[] = [
  { value: "DAILY", label: "Diária" },
  { value: "WEEKLY", label: "Semanal" },
  { value: "MONTHLY", label: "Mensal" },
  { value: "YEARLY", label: "Anual" },
];

export interface RecurringTransactionFormInitialValues {
  type: TransactionType;
  accountId: string;
  destinationAccountId?: string | null;
  amountMinor: number;
  categoryId?: string | null;
  description: string;
  frequency: RecurrenceFrequency;
  interval: number;
  startDate: string;
  endDate?: string | null;
  // [Task 3] Só preenchido quando já é uma série de transferência entre
  // moedas diferentes — pré-enche o campo de taxa ao editar.
  exchangeRate?: string | null;
}

// [Fase 4 — Recorrências] Reaproveita o seletor de tipo/conta/categoria já
// usado em transaction-form.tsx (mesmo padrão visual, mesma lógica de
// "categoria só faz sentido fora de TRANSFER") — os campos extra aqui
// (frequência, intervalo, data de início, fim opcional) são só a "receita"
// que o materializador (src/lib/db/recurring-transactions.ts) usa depois
// para gerar as Transactions reais, uma a uma, na leitura.
//
// [Task 1 — editar recorrência] `mode="edit"` reutiliza o mesmo formulário
// (mesmo padrão de TransactionForm create/edit) — `type` deixa de ser
// escolhível (nunca editável, mesma regra de `currency`, ver
// updateRecurringTransaction) e o `open` interno não se aplica: quem decide
// mostrar o formulário de edição é o `RecurringTransactionCard`, não um
// botão próprio aqui dentro.
export function RecurringTransactionForm({
  accounts,
  categories,
  mode = "create",
  recurringTransactionId,
  initialValues,
  onSaved,
  onCancelEdit,
}: {
  accounts: RecurringTransactionFormAccount[];
  categories: RecurringTransactionFormCategory[];
  mode?: "create" | "edit";
  recurringTransactionId?: string;
  initialValues?: RecurringTransactionFormInitialValues;
  onSaved?: () => void;
  onCancelEdit?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [type, setType] = useState<TransactionType>(initialValues?.type ?? "EXPENSE");
  const [accountId, setAccountId] = useState(initialValues?.accountId ?? accounts[0]?.id ?? "");
  const [destinationAccountId, setDestinationAccountId] = useState(initialValues?.destinationAccountId ?? "");
  const [amount, setAmount] = useState(() => {
    if (!initialValues) return "";
    const account = accounts.find((a) => a.id === initialValues.accountId);
    return fromMinor(BigInt(initialValues.amountMinor), account?.currency ?? "CVE");
  });
  const [exchangeRate, setExchangeRate] = useState(initialValues?.exchangeRate ?? "");
  const [categoryId, setCategoryId] = useState(initialValues?.categoryId ?? "");
  const [categoryList, setCategoryList] = useState(categories);
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(initialValues?.frequency ?? "MONTHLY");
  const [interval, setInterval] = useState(String(initialValues?.interval ?? 1));
  const [startDate, setStartDate] = useState(initialValues?.startDate ?? new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(initialValues?.endDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const relevantCategories = categoryList.filter((c) => c.kind === type);
  const selectedAccount = accounts.find((a) => a.id === accountId);
  const currency = selectedAccount?.currency ?? "CVE";
  const decimalPlaces = getCurrencyDecimalPlaces(currency);

  // [Task 3 — transferências multi-moeda]
  const destinationCurrency = accounts.find((a) => a.id === destinationAccountId)?.currency;
  const needsExchangeRate = type === "TRANSFER" && !!destinationCurrency && destinationCurrency !== currency;
  let destinationPreview: string | null = null;
  if (needsExchangeRate && exchangeRate && destinationCurrency) {
    try {
      destinationPreview = fromMinor(convertByExchangeRate(toMinor(amount || "0", currency), exchangeRate, currency, destinationCurrency), destinationCurrency);
    } catch {
      destinationPreview = null;
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    let amountMinorBig: bigint;
    try {
      amountMinorBig = toMinor(amount, currency);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Valor inválido.");
      return;
    }
    if (amountMinorBig <= 0n) {
      setError("Indica um valor maior que zero.");
      return;
    }
    const amountMinor = Number(amountMinorBig);
    if (type === "TRANSFER" && !destinationAccountId) {
      setError("Escolhe a conta de destino da transferência.");
      return;
    }
    if (type === "TRANSFER" && destinationAccountId === accountId) {
      setError("A conta de destino tem de ser diferente da conta de origem.");
      return;
    }
    if (needsExchangeRate && !exchangeRate) {
      setError("Indica a taxa de câmbio desta transferência.");
      return;
    }
    const intervalValue = Number(interval);
    if (!Number.isInteger(intervalValue) || intervalValue < 1) {
      setError("O intervalo tem de ser pelo menos 1.");
      return;
    }

    setLoading(true);
    try {
      const isEdit = mode === "edit";
      const res = await fetch(isEdit ? `/api/recurring-transactions/${recurringTransactionId}` : "/api/recurring-transactions", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEdit
            ? {
                accountId,
                destinationAccountId: type === "TRANSFER" ? destinationAccountId : undefined,
                amountMinor,
                exchangeRate: needsExchangeRate ? exchangeRate : undefined,
                categoryId: type === "TRANSFER" ? undefined : categoryId || null,
                description,
                frequency,
                interval: intervalValue,
                startDate,
                endDate: endDate || null,
              }
            : {
                type,
                accountId,
                destinationAccountId: type === "TRANSFER" ? destinationAccountId : undefined,
                amountMinor,
                exchangeRate: needsExchangeRate ? exchangeRate : undefined,
                categoryId: type === "TRANSFER" ? undefined : categoryId || undefined,
                description,
                frequency,
                interval: intervalValue,
                startDate,
                endDate: endDate || undefined,
              },
        ),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Não foi possível ${isEdit ? "guardar as alterações" : "criar a recorrência"}.`);
        return;
      }
      toast.success(isEdit ? "Recorrência atualizada." : "Recorrência criada.");
      if (isEdit) {
        onSaved?.();
      } else {
        setOpen(false);
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (mode === "create" && !open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        + Nova recorrência
      </Button>
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {mode === "create" ? (
          <div className="grid grid-cols-3 gap-2">
            {(["EXPENSE", "INCOME", "TRANSFER"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                  type === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                }`}
              >
                {t === "EXPENSE" ? "Despesa" : t === "INCOME" ? "Receita" : "Transferência"}
              </button>
            ))}
          </div>
        ) : (
          // [Task 1] `type` nunca é editável — mostrado só como etiqueta,
          // nunca um controlo. Mudar o tipo de uma série já em uso é criar
          // uma nova, não editar esta.
          <Badge tone={type === "INCOME" ? "success" : type === "EXPENSE" ? "danger" : "info"}>
            {type === "EXPENSE" ? "Despesa" : type === "INCOME" ? "Receita" : "Transferência"}
          </Badge>
        )}

        <label className="text-xs font-medium text-muted-foreground">
          {type === "TRANSFER" ? "Conta de origem" : "Conta"}
          <select
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        {type === "TRANSFER" && (
          <label className="text-xs font-medium text-muted-foreground">
            Conta de destino
            <select
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              value={destinationAccountId}
              onChange={(e) => setDestinationAccountId(e.target.value)}
            >
              <option value="">Escolhe...</option>
              {accounts
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
        )}

        <label className="text-xs font-medium text-muted-foreground">
          {`Valor (${currency})`}
          <Input
            type="number"
            inputMode="decimal"
            min={decimalPlaces > 0 ? 0.01 : 1}
            step={decimalPlaces > 0 ? 10 ** -decimalPlaces : 1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={decimalPlaces > 0 ? "Ex: 50.00" : "Ex: 5000"}
            required
            className="mt-1"
          />
        </label>

        {needsExchangeRate && (
          <label className="text-xs font-medium text-muted-foreground">
            {`Taxa de câmbio (${destinationCurrency} por 1 ${currency})`}
            <Input
              type="number"
              inputMode="decimal"
              min={0.000001}
              step="any"
              value={exchangeRate}
              onChange={(e) => setExchangeRate(e.target.value)}
              placeholder="Ex: 110"
              required
              className="mt-1"
            />
            {destinationPreview && (
              <span className="mt-1 block text-xs text-muted-foreground">
                A conta de destino recebe ≈ {destinationPreview} {destinationCurrency} por ocorrência
              </span>
            )}
          </label>
        )}

        {type !== "TRANSFER" && (
          <label className="text-xs font-medium text-muted-foreground">
            Categoria
            <select
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Sem categoria</option>
              {relevantCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <CategoryQuickCreate
              kind={type === "INCOME" ? "INCOME" : "EXPENSE"}
              onCreated={(category: CreatedCategory) => {
                setCategoryList((current) => [...current, category]);
                setCategoryId(category.id);
              }}
            />
          </label>
        )}

        <label className="text-xs font-medium text-muted-foreground">
          Descrição
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Renda" required className="mt-1" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-muted-foreground">
            Frequência
            <select
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}
            >
              {FREQUENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            A cada quantos
            <Input type="number" inputMode="numeric" min={1} step={1} value={interval} onChange={(e) => setInterval(e.target.value)} className="mt-1" />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-muted-foreground">
            Início
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className="mt-1" />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Fim (opcional)
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1" />
          </label>
        </div>

        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? "A guardar..." : mode === "edit" ? "Guardar alterações" : "Criar recorrência"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => (mode === "edit" ? onCancelEdit?.() : setOpen(false))}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
