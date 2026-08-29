"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AccountType } from "@/lib/financial-engine";

const TYPE_OPTIONS: { value: AccountType; label: string }[] = [
  { value: "WALLET", label: "Carteira" },
  { value: "BANK", label: "Conta bancária" },
  { value: "SAVINGS", label: "Poupança" },
  { value: "CREDIT_CARD", label: "Cartão de crédito" },
  { value: "INVESTMENT", label: "Investimento" },
  { value: "EMERGENCY_FUND", label: "Cofre de emergência" },
  { value: "OTHER", label: "Outra" },
];

export function AccountForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("BANK");
  const [initialBalance, setInitialBalance] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, initialBalanceMinor: Number(initialBalance) || 0 }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível criar a conta.");
        return;
      }
      setName("");
      setInitialBalance("0");
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        + Nova conta
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      {/* [Correção — Pre-Beta Hardening, Prioridade 11] Faltavam labels
          associados aos campos (só placeholder, que desaparece ao escrever e
          não é lido como nome do campo por leitores de ecrã). Mesmo padrão
          visual já usado em transaction-form.tsx — não é um elemento novo no
          design, só aplicado aqui também. */}
      <label className="text-xs font-medium text-muted-foreground">
        Nome
        <Input placeholder="Ex: Banco BCA" value={name} onChange={(e) => setName(e.target.value)} required autoFocus className="mt-1" />
      </label>
      <label className="text-xs font-medium text-muted-foreground">
        Tipo de conta
        <select
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          value={type}
          onChange={(e) => setType(e.target.value as AccountType)}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-muted-foreground">
        Saldo inicial (CVE)
        <Input
          type="number"
          placeholder="0"
          value={initialBalance}
          onChange={(e) => setInitialBalance(e.target.value)}
          className="mt-1"
        />
      </label>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? "A criar..." : "Criar conta"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
