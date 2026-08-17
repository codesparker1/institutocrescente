"use client";

import { useActionState } from "react";
import { Select } from "@/components/ui/Select";
import { atualizarProfessorTurmaDisciplinaAction } from "@/actions/admin";

const initialState: { error?: string } = {};

interface Opcao {
  id: string;
  nome: string;
}

interface EditarProfessorTurmaDisciplinaProps {
  turmaDisciplinaId: string;
  professorAtualId: string;
  professores: Opcao[];
}

export function EditarProfessorTurmaDisciplina({ turmaDisciplinaId, professorAtualId, professores }: EditarProfessorTurmaDisciplinaProps) {
  const [state, formAction, isPending] = useActionState(atualizarProfessorTurmaDisciplinaAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="id" value={turmaDisciplinaId} />
      <Select name="professorId" defaultValue={professorAtualId} disabled={isPending} className="py-1 text-xs">
        {professores.map((professor) => (
          <option key={professor.id} value={professor.id}>
            {professor.nome}
          </option>
        ))}
      </Select>
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
