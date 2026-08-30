"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ACCOUNT_COLORS, type AccountColorId } from "@/lib/account-colors";
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
  // [Correção — cor da conta] Começa já com a primeira cor da paleta
  // selecionada (em vez de "sem cor") — o pedido era tornar a app mais
  // visual por omissão, não obrigar a um passo extra para isso acontecer.
  const [color, setColor] = useState<AccountColorId>(ACCOUNT_COLORS[0].id);
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
        body: JSON.stringify({ name, type, initialBalanceMinor: Number(initialBalance) || 0, color }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível criar a conta.");
        return;
      }
      setName("");
      setInitialBalance("0");
      setColor(ACCOUNT_COLORS[0].id);
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
      <div className="text-xs font-medium text-muted-foreground">
        Cor da conta
        <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Cor da conta">
          {ACCOUNT_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={color === c.id}
              aria-label={c.label}
              title={c.label}
              onClick={() => setColor(c.id)}
              className="h-7 w-7 rounded-full transition-transform"
              style={{
                backgroundColor: c.hex,
                // "Halo" à volta da cor selecionada: um anel do tom da
                // própria cor, com um respiro do fundo da app entre a bolinha
                // e o anel — assim funciona em tema claro e escuro sem
                // precisar de saber qual está ativo.
                boxShadow: color === c.id ? `0 0 0 2px var(--color-surface), 0 0 0 4px ${c.hex}` : "none",
                transform: color === c.id ? "scale(1.05)" : "scale(1)",
              }}
            />
          ))}
        </div>
      </div>
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
