"use client";

import { useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast-provider";
import type { CategoryKind } from "@/lib/financial-engine";

export interface CreatedCategory {
  id: string;
  name: string;
  kind: CategoryKind;
}

// [Correção — pacote UX pós-auditoria] `POST /api/categories` já existia,
// validado, mas nenhum componente alguma vez o chamava — uma categoria só
// podia ser escolhida de entre as seedadas. Este é o único sítio onde uma
// categoria é escolhida hoje (o <select> de transaction-form.tsx), por isso
// é o único sítio onde criar uma faz sentido.
//
// [Correção — bug encontrado em QA manual] Este componente é sempre montado
// dentro de outro <form> (o de Transação/Recorrência, à volta do <select> de
// categoria). Por isso NÃO pode ter o seu próprio elemento <form> — HTML não
// permite <form> aninhado, e o browser reagrupa o DOM de forma inesperada
// (React acusa isto como erro de hidratação), o que fazia o clique em
// "Criar" não disparar o submit certo e a categoria nova parecer desaparecer
// em silêncio. Em vez de <form onSubmit>, o botão "Criar" chama a função
// diretamente via onClick, e o campo de texto trata Enter à mão.
export function CategoryQuickCreate({ kind, onCreated }: { kind: CategoryKind; onCreated: (category: CreatedCategory) => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!name.trim()) {
      setError("Indica um nome para a categoria.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, kind }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível criar a categoria.");
        return;
      }
      const category = (await res.json()) as CreatedCategory;
      onCreated(category);
      toast.success("Categoria criada.");
      setName("");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 text-xs font-medium text-primary hover:underline"
      >
        + Nova categoria
      </button>
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Sem <form>, o Enter deixou de disparar submit sozinho — replicamos só
    // o comportamento útil (Enter = confirmar), sem reintroduzir um <form>.
    if (event.key === "Enter") {
      event.preventDefault();
      if (!loading) void handleCreate();
    }
  }

  return (
    <div className="mt-2 flex items-start gap-2">
      <div className="flex-1">
        <Input
          placeholder="Ex: Streaming"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      </div>
      <Button type="button" size="sm" disabled={loading} onClick={() => void handleCreate()}>
        {loading ? "A criar..." : "Criar"}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancelar
      </Button>
    </div>
  );
}
