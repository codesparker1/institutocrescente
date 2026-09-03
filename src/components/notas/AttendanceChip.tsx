"use client";

import { useState, useTransition } from "react";
import { toggleFrequenciaAction } from "@/actions/frequencia";
import { cn } from "@/lib/utils";

interface AttendanceChipProps {
  frequenciaId: string;
  nome: string;
  presenteInicial: boolean;
  disabled?: boolean;
  /** Inscrição já não ativa (suspensão, repetição, mudança de curso) — o registo é histórico,
   * mantido tal como estava, mas já não faz parte do efetivo atual da disciplina. */
  inativa?: boolean;
}

export function AttendanceChip({ frequenciaId, nome, presenteInicial, disabled, inativa }: AttendanceChipProps) {
  const [presente, setPresente] = useState(presenteInicial);
  const [isPending, startTransition] = useTransition();
  const desativado = disabled || inativa;

  function handleClick() {
    if (desativado) return;
    const formData = new FormData();
    formData.set("frequenciaId", frequenciaId);
    setPresente((v) => !v);
    startTransition(async () => {
      await toggleFrequenciaAction(formData);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={desativado || isPending}
      title={inativa ? "Aluno já não está ativo nesta disciplina — registo histórico" : undefined}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        inativa
          ? "border-navy-100 bg-navy-50 text-texto-suave"
          : presente
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : "border-navy-100 bg-white text-texto-suave hover:bg-navy-50",
      )}
    >
      {nome}
      {inativa ? " (inativo)" : ""}
    </button>
  );
}
