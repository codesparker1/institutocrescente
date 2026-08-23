"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { processarRematriculaAction, type ProcessarRematriculaState } from "@/actions/academico";

const initialState: ProcessarRematriculaState = {};

interface RematriculaFormProps {
  alunoId: string;
  dentroDaJanela: boolean;
  /** ADMIN pode rematricular fora da janela (poder ADMIN confirmado §3.5); Secretaria não. */
  podeForaDaJanela?: boolean;
}

export function RematriculaForm({ alunoId, dentroDaJanela, podeForaDaJanela }: RematriculaFormProps) {
  const [state, formAction, isPending] = useActionState(processarRematriculaAction, initialState);

  if (!dentroDaJanela && !podeForaDaJanela) {
    return <p className="text-xs text-navy-400">Fora do período de matrícula — sem ação disponível.</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="alunoId" value={alunoId} />
      {!dentroDaJanela && podeForaDaJanela ? (
        <p className="text-xs text-amber-700">
          Fora do período de matrícula — a rematrícula tardia é um poder exclusivo da ADMIN e pode
          gerar multa tardia se estiver configurada.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-gold-100 hover:bg-navy-800 disabled:opacity-60"
      >
        {isPending ? "A processar..." : "Processar Rematrícula"}
      </button>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.resultado ? (
        <p className="flex items-start gap-1.5 text-sm text-green-700">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          {state.resultado}
        </p>
      ) : null}
    </form>
  );
}
