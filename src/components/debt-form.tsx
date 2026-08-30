"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { generateInstallmentPlan } from "@/lib/financial-engine";

const FREQUENCY_OPTIONS: { value: "MONTHLY" | "WEEKLY" | "DAILY" | "YEARLY"; label: string }[] = [
  { value: "MONTHLY", label: "Mensal" },
  { value: "WEEKLY", label: "Semanal" },
  { value: "DAILY", label: "Diária" },
  { value: "YEARLY", label: "Anual" },
];

export function DebtForm() {
  const router = useRouter();
  const [creditorName, setCreditorName] = useState("");
  const [description, setDescription] = useState("");
  const [originalAmount, setOriginalAmount] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [installmentCount, setInstallmentCount] = useState("12");
  const [frequency, setFrequency] = useState<"MONTHLY" | "WEEKLY" | "DAILY" | "YEARLY">("MONTHLY");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  // [Correção — implementação da interface de Dívidas] Pré-visualização do
  // plano de parcelas no cliente, usando a mesma função
  // (generateInstallmentPlan) que o servidor volta a correr para gravar —
  // isto é só para o utilizador ver o que vai acontecer antes de confirmar,
  // nunca é o valor que fica gravado (o servidor recalcula sempre).
  const preview = useMemo(() => {
    const amount = Number(originalAmount);
    const count = Number(installmentCount);
    if (!Number.isInteger(amount) || amount <= 0 || !Number.isInteger(count) || count < 1 || !startDate) {
      return null;
    }
    try {
      return generateInstallmentPlan(BigInt(amount), count, startDate, frequency);
    } catch {
      return null;
    }
  }, [originalAmount, installmentCount, startDate, frequency]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const amountMinor = Number(originalAmount);
    const count = Number(installmentCount);
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      setError("Indica um valor inteiro maior que zero (em CVE).");
      return;
    }
    if (!Number.isInteger(count) || count < 1) {
      setError("O número de parcelas tem de ser pelo menos 1.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/debts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creditorName,
          description: description || undefined,
          originalAmountMinor: amountMinor,
          interestRate: interestRate ? Number(interestRate) : undefined,
          startDate,
          installmentCount: count,
          frequency,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível criar a dívida.");
        return;
      }
      setCreditorName("");
      setDescription("");
      setOriginalAmount("");
      setInterestRate("");
      setInstallmentCount("12");
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        + Nova dívida
      </Button>
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="text-xs font-medium text-muted-foreground">
          Credor
          <Input
            placeholder="Ex: Banco BCA"
            value={creditorName}
            onChange={(e) => setCreditorName(e.target.value)}
            required
            autoFocus
            className="mt-1"
          />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Descrição (opcional)
          <Input placeholder="Ex: Empréstimo pessoal" value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Valor total (CVE)
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            placeholder="Ex: 120000"
            value={originalAmount}
            onChange={(e) => setOriginalAmount(e.target.value)}
            required
            className="mt-1"
          />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Taxa de juro anual, % (opcional)
          <Input
            type="number"
            step="0.001"
            min={0}
            placeholder="Ex: 12.5"
            value={interestRate}
            onChange={(e) => setInterestRate(e.target.value)}
            className="mt-1"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-muted-foreground">
            Nº de parcelas
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={installmentCount}
              onChange={(e) => setInstallmentCount(e.target.value)}
              required
              className="mt-1"
            />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Frequência
            <select
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as typeof frequency)}
            >
              {FREQUENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="text-xs font-medium text-muted-foreground">
          Data da primeira parcela
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className="mt-1" />
        </label>

        {preview && (
          <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">
              {preview.length} parcela{preview.length === 1 ? "" : "s"}, última em {preview[preview.length - 1].dueDate}
            </p>
            <p>
              Ex: 1ª parcela de {preview[0].amountMinor.toString()} CVE em {preview[0].dueDate}
            </p>
          </div>
        )}

        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? "A criar..." : "Criar dívida"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
