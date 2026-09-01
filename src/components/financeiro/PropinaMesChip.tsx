"use client";

import { useState, useTransition } from "react";
import { togglePropinaAction } from "@/actions/financeiro";
import { cn } from "@/lib/utils";

interface PropinaMesChipProps {
  propinaId: string;
  /**
   * Estado vindo do servidor — não é copiado para estado local (§erro React #441, 2026-09-01).
   * O chip guardava `pagoInicial` num useState e escrevia-lhe DEPOIS do await da action; entretanto
   * o revalidatePath dessa mesma action já tinha mandado o router recarregar a árvore, e o React
   * rebentava ao ver a atualização de estado sobre uma transição já resolvida. Sem cópia local não
   * há nada para dessincronizar: o novo valor chega sempre por esta prop.
   */
  pago: boolean;
  disabled?: boolean;
  /// Estado visual derivado (Opção A) — distingue "Pendente" futuro de "Devendo" (vencido+tolerância).
  estadoVisual: "PAGO" | "AGUARDA_VENCIMENTO" | "DEVENDO";
  /**
   * Quem carrega o estado no cliente (a busca da Secretaria) passa isto para recarregar depois da
   * mudança. Num Server Component não é preciso — o revalidatePath da action trata disso.
   */
  onAtualizado?: () => void;
}

export function PropinaMesChip({ propinaId, pago, disabled, estadoVisual, onAtualizado }: PropinaMesChipProps) {
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (disabled) return;
    setErro(null);
    const formData = new FormData();
    formData.set("propinaId", propinaId);
    startTransition(async () => {
      try {
        const resultado = await togglePropinaAction(formData);
        if (resultado?.error) {
          setErro(resultado.error);
          return;
        }
        // Quem carrega no cliente recarrega; quem é Server Component recebe o novo estado do
        // revalidatePath da action. Em qualquer dos casos o novo valor chega por prop.
        onAtualizado?.();
      } catch (error) {
        // togglePropinaAction lança Error diretamente em alguns casos (ex. sessão desatualizada
        // em requireSessao) — sem isto o clique parecia não fazer nada.
        setErro(error instanceof Error ? error.message : "Não foi possível atualizar o estado.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isPending}
        className={cn(
          "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
          pago
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : estadoVisual === "DEVENDO"
              ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
              : "border-navy-100 bg-white text-navy-400 hover:bg-navy-50",
        )}
      >
        {pago ? "Pago" : estadoVisual === "DEVENDO" ? "Devendo" : "Pendente"}
      </button>
      {erro ? <p className="text-xs text-red-600">{erro}</p> : null}
    </div>
  );
}
