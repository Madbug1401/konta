"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function TransactionRowActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!window.confirm("Remover esta transação? Esta ação não pode ser desfeita.")) return;
    setPending(true);
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    // [Correção — Pre-Beta Hardening, Prioridade 11] 36×36px (h-9 w-9) fica
    // abaixo do alvo de toque mínimo recomendado (~44px) — difícil de acertar
    // em mobile, especialmente numa linha de tabela densa. 44×44px (h-11
    // w-11) sem mudar mais nada (ícone, cor, espaçamento entre os dois
    // botões continuam iguais).
    <div className="flex items-center gap-1">
      <Link
        href={`/transactions/${id}/edit`}
        aria-label="Editar transação"
        className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-hover hover:text-foreground"
      >
        <Pencil className="h-4 w-4" />
      </Link>
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        aria-label="Remover transação"
        className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-danger/10 hover:text-danger disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
