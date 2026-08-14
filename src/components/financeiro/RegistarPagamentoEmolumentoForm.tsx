"use client";

import { useActionState } from "react";
import { Select } from "@/components/ui/Select";
import { registarPagamentoEmolumentoAction } from "@/actions/financeiro";
import type { EmolumentoCatalogo } from "@/lib/financeiro";

const initialState: { error?: string } = {};

interface RegistarPagamentoEmolumentoFormProps {
  alunoId: string;
  emolumentos: EmolumentoCatalogo[];
}

export function RegistarPagamentoEmolumentoForm({ alunoId, emolumentos }: RegistarPagamentoEmolumentoFormProps) {
  const [state, formAction, isPending] = useActionState(
    async (_prevState: { error?: string }, formData: FormData) => registarPagamentoEmolumentoAction(formData),
    initialState,
  );

  if (emolumentos.length === 0) {
    return <p className="text-sm text-navy-400">Nenhum emolumento ativo no catálogo.</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <input type="hidden" name="alunoId" value={alunoId} />
      <Select name="emolumentoId" required className="sm:min-w-[16rem]">
        {emolumentos.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nome} · {e.valor.toLocaleString("pt-PT")} Kz
          </option>
        ))}
      </Select>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-gold-100 hover:bg-navy-800 disabled:opacity-60"
      >
        {isPending ? "A registar..." : "Registar pagamento"}
      </button>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
