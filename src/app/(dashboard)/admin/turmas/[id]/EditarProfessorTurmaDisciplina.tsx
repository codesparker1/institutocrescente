"use client";

import { useActionState } from "react";
import { Select } from "@/components/ui/Select";
import { atualizarProfessorTurmaDisciplinaAction } from "@/actions/admin";
import { PROFESSOR_POR_ATRIBUIR } from "@/lib/utils";

const initialState: { error?: string } = {};

interface Opcao {
  id: string;
  nome: string;
}

interface EditarProfessorTurmaDisciplinaProps {
  turmaDisciplinaId: string;
  /** null enquanto o DAAC não tiver atribuído professor a esta disciplina. */
  professorAtualId: string | null;
  professores: Opcao[];
}

export function EditarProfessorTurmaDisciplina({ turmaDisciplinaId, professorAtualId, professores }: EditarProfessorTurmaDisciplinaProps) {
  const [state, formAction, isPending] = useActionState(atualizarProfessorTurmaDisciplinaAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="id" value={turmaDisciplinaId} />
      <Select
        name="professorId"
        defaultValue={professorAtualId ?? ""}
        disabled={isPending}
        className={professorAtualId ? "py-1 text-xs" : "py-1 text-xs border-gold-300 bg-gold-50"}
      >
        {/* A disciplina nasce do plano curricular sem professor — este é o estado inicial, e
            continua a ser escolhível para o DAAC poder desfazer uma atribuição errada. */}
        <option value="">{PROFESSOR_POR_ATRIBUIR}</option>
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
