"use client";

import { useState, useTransition } from "react";
import { toggleMultaAction } from "@/actions/financeiro";
import { cn } from "@/lib/utils";

interface MultaChipProps {
  multaId: string;
  pagoInicial: boolean;
}

export function MultaChip({ multaId, pagoInicial }: MultaChipProps) {
  const [pago, setPago] = useState(pagoInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setErro(null);
    const formData = new FormData();
    formData.set("multaId", multaId);
    startTransition(async () => {
      try {
        const resultado = await toggleMultaAction(formData);
        if (resultado?.error) {
          setErro(resultado.error);
          return;
        }
        setPago((v) => !v);
      } catch (error) {
        // togglePropinaAction/toggleMultaAction lançam Error diretamente em alguns casos (ex.
        // sessão desatualizada em requireSessao) — sem isto o clique parecia não fazer nada.
        setErro(error instanceof Error ? error.message : "Não foi possível atualizar o estado.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className={cn(
          "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
          pago
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : "border-navy-100 bg-white text-navy-400 hover:bg-navy-50",
        )}
      >
        {pago ? "Pago" : "Pendente"}
      </button>
      {erro ? <p className="text-xs text-red-600">{erro}</p> : null}
    </div>
  );
}
