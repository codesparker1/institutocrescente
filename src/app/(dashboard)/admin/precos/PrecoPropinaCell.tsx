"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Input";
import { atualizarPrecoPropinaAction } from "@/actions/admin";
import type { CategoriaEstudante } from "@/generated/prisma/client";

const initialState: { error?: string } = {};

interface PrecoPropinaCellProps {
  categoria: CategoriaEstudante;
  anoCurricular: number;
  valorInicial: number | null;
}

/** Uma célula editável da grelha categoria×ano — grava ao sair do campo, como CategoriaEstudanteForm. */
export function PrecoPropinaCell({ categoria, anoCurricular, valorInicial }: PrecoPropinaCellProps) {
  const [state, formAction, isPending] = useActionState(atualizarPrecoPropinaAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="categoria" value={categoria} />
      <input type="hidden" name="anoCurricular" value={anoCurricular} />
      <Input
        name="valor"
        type="number"
        min={0}
        step="0.01"
        disabled={isPending}
        defaultValue={valorInicial ?? undefined}
        placeholder="Por definir"
        onBlur={(e) => {
          if (e.currentTarget.value !== "") e.currentTarget.form?.requestSubmit();
        }}
        className="w-32"
      />
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
