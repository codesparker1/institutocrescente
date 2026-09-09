"use client";

import { useState, useActionState } from "react";
import { Input } from "@/components/ui/Input";
import { lancarNotaDefesaAction, type LancarNotaDefesaState } from "@/actions/notas";

const initialState: LancarNotaDefesaState = {};

interface LancarNotaDefesaProps {
  inscricaoId: string;
  notaFinal: number | null;
}

/**
 * Atalho para lançar a nota da defesa sem sair de Finalistas (§pedido do cliente 2026-09-09) — a
 * mesma ação (lancarNotaDefesaAction) que a ficha do aluno usa, só que aqui não é preciso abrir
 * "editar" numa linha do Percurso Curricular para lá chegar.
 */
export function LancarNotaDefesa({ inscricaoId, notaFinal }: LancarNotaDefesaProps) {
  const [state, formAction, isPending] = useActionState(lancarNotaDefesaAction, initialState);
  // Fechado por omissão quando já há nota — ver antes de decidir corrigir, não editar de imediato.
  // Depois de lançar, volta a mostrar a nota em vez do campo (§reportado 2026-09-09: "guarda mas
  // depois não sai do modo editar"): um `useState(notaFinal === null)` só corre na montagem, e o
  // campo ficava aberto mesmo com a nota já gravada e revalidada.
  //
  // Derivado, e não um useEffect com setState (proibido por react-hooks/set-state-in-effect) — ver
  // a mesma solução, com a explicação completa, em LinhaPercursoEditavel.
  const [estadoAoCorrigir, setEstadoAoCorrigir] = useState<LancarNotaDefesaState | null>(null);
  const aberto =
    estadoAoCorrigir !== null
      ? !(state.ok && state !== estadoAoCorrigir)
      : notaFinal === null && !state.ok;

  if (!aberto && notaFinal !== null) {
    return (
      <div className="flex items-center gap-2">
        <span className="font-semibold text-texto">{notaFinal.toFixed(1)}</span>
        <button type="button" onClick={() => setEstadoAoCorrigir(state)} className="text-xs text-texto-suave hover:text-navy-600 hover:underline">
          corrigir
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="inscricaoId" value={inscricaoId} />
      <div className="flex items-center gap-1.5">
        <Input
          key={notaFinal ?? "none"}
          name="nota"
          type="number"
          min={0}
          max={20}
          step={0.1}
          required
          defaultValue={notaFinal ?? ""}
          disabled={isPending}
          className="w-16 py-1 text-center text-xs"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-navy-700 px-2.5 py-1.5 text-xs font-semibold text-gold-100 hover:bg-navy-800 disabled:opacity-60"
        >
          {isPending ? "..." : "Lançar"}
        </button>
        {notaFinal !== null ? (
          <button type="button" onClick={() => setEstadoAoCorrigir(null)} className="text-xs text-texto-suave hover:text-navy-600">
            cancelar
          </button>
        ) : null}
      </div>
      {state.error ? <p className="max-w-40 text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
