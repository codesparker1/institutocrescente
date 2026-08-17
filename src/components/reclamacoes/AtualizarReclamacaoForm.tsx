"use client";

import { useActionState } from "react";
import { Select } from "@/components/ui/Select";
import { atualizarReclamacaoAction, type AtualizarReclamacaoState } from "@/actions/reclamacoes";

const initialState: AtualizarReclamacaoState = {};

interface AtualizarReclamacaoFormProps {
  reclamacaoId: string;
  statusAtual: "PENDENTE" | "EM_ANALISE" | "RESOLVIDO";
  respostaAtual: string | null;
}

export function AtualizarReclamacaoForm({ reclamacaoId, statusAtual, respostaAtual }: AtualizarReclamacaoFormProps) {
  const [state, formAction, isPending] = useActionState(atualizarReclamacaoAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2 border-t border-navy-50 pt-3">
      <input type="hidden" name="id" value={reclamacaoId} />
      <div className="flex flex-wrap items-end gap-2">
        <Select name="status" defaultValue={statusAtual} className="w-40 text-sm">
          <option value="PENDENTE">Pendente</option>
          <option value="EM_ANALISE">Em análise</option>
          <option value="RESOLVIDO">Resolvido</option>
        </Select>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-navy-700 px-3 py-2 text-xs font-semibold text-gold-100 hover:bg-navy-800 disabled:opacity-60"
        >
          {isPending ? "A guardar..." : "Guardar"}
        </button>
      </div>
      <textarea
        name="resposta"
        rows={2}
        defaultValue={respostaAtual ?? ""}
        placeholder="Resposta ao aluno (opcional)"
        className="rounded-lg border border-navy-100 bg-white px-3 py-2 text-xs text-navy-900 placeholder:text-navy-300 focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-100"
      />
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
