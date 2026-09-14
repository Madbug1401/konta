"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast-provider";
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

export interface AccountEditFormProps {
  accountId: string;
  initialValues: { name: string; type: AccountType; color: AccountColorId | null };
}

// [Fase 2 — editar Conta] `currency` e `initialBalanceMinor` não aparecem
// aqui de propósito — ver o comentário junto a `updateAccount` em
// src/lib/db/accounts.ts para a razão (mistura de moedas / deslocamento
// retroativo do histórico de saldos).
export function AccountEditForm({ accountId, initialValues }: AccountEditFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(initialValues.name);
  const [type, setType] = useState<AccountType>(initialValues.type);
  const [color, setColor] = useState<AccountColorId | null>(initialValues.color);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, color }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível guardar as alterações.");
        return;
      }
      toast.success("Conta atualizada.");
      router.push("/accounts");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="text-xs font-medium text-muted-foreground">
          Nome
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus className="mt-1" />
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
            {loading ? "A guardar..." : "Guardar alterações"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.push("/accounts")}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
