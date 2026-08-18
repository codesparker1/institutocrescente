"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Input";
import { atualizarPercentagemAgravamentoAction } from "@/actions/admin";

const initialState: { error?: string } = {};

interface PercentagemAgravamentoFormProps {
  valorInicial: number;
}

/** Grava ao sair do campo, como PrecoPropinaCell. */
export function PercentagemAgravamentoForm({ valorInicial }: PercentagemAgravamentoFormProps) {
  const [state, formAction, isPending] = useActionState(atualizarPercentagemAgravamentoAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-3">
      <Input
        name="percentagem"
        type="number"
        min={0}
        step="0.01"
        disabled={isPending}
        defaultValue={valorInicial}
        onBlur={(e) => {
          if (e.currentTarget.value !== "") e.currentTarget.form?.requestSubmit();
        }}
        className="w-32"
      />
      <span className="text-sm text-navy-500">% por cadeira em repetição</span>
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
