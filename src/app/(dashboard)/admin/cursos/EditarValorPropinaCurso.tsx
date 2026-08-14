"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Input";
import { atualizarValorPropinaCursoAction } from "@/actions/admin";

const initialState: { error?: string } = {};

interface EditarValorPropinaCursoProps {
  cursoId: string;
  valorPropina: number;
}

export function EditarValorPropinaCurso({ cursoId, valorPropina }: EditarValorPropinaCursoProps) {
  const [state, formAction, isPending] = useActionState(atualizarValorPropinaCursoAction, initialState);

  return (
    <form action={formAction} className="flex items-center justify-end gap-1.5">
      <input type="hidden" name="cursoId" value={cursoId} />
      <Input
        name="valorPropina"
        type="number"
        min={0}
        step="0.01"
        defaultValue={valorPropina}
        disabled={isPending}
        className="w-28 py-1 text-right"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-navy-700 px-2.5 py-1.5 text-xs font-semibold text-gold-100 hover:bg-navy-800 disabled:opacity-60"
      >
        {isPending ? "..." : "Guardar"}
      </button>
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
