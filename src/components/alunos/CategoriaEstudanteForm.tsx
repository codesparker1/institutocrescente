"use client";

import { useActionState } from "react";
import { Select } from "@/components/ui/Select";
import { atualizarCategoriaEstudanteAction, type AtualizarCategoriaState } from "@/actions/alunos";
import type { CategoriaEstudante } from "@/generated/prisma/client";

const initialState: AtualizarCategoriaState = {};

const CATEGORIA_LABEL: Record<CategoriaEstudante, string> = {
  NORMAL: "Normal",
  BOLSEIRO_INAGBE: "Bolseiro INAGBE",
  COMPARTICIPADA: "Comparticipada",
};

interface CategoriaEstudanteFormProps {
  alunoId: string;
  categoria: CategoriaEstudante;
  editable: boolean;
}

export function CategoriaEstudanteForm({ alunoId, categoria, editable }: CategoriaEstudanteFormProps) {
  const [state, formAction, isPending] = useActionState(atualizarCategoriaEstudanteAction, initialState);

  if (!editable) {
    return <span className="font-medium text-navy-800">{CATEGORIA_LABEL[categoria]}</span>;
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="alunoId" value={alunoId} />
      <Select
        name="categoria"
        defaultValue={categoria}
        disabled={isPending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="w-44"
      >
        {Object.entries(CATEGORIA_LABEL).map(([valor, label]) => (
          <option key={valor} value={valor}>
            {label}
          </option>
        ))}
      </Select>
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
