"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { iniciarNovoCursoAction, type IniciarNovoCursoState } from "@/actions/academico";

const initialState: IniciarNovoCursoState = {};

interface CursoOption {
  id: string;
  nome: string;
}

interface MudarCursoFormProps {
  alunoId: string;
  cursos: CursoOption[];
}

export function MudarCursoForm({ alunoId, cursos }: MudarCursoFormProps) {
  const [state, formAction, isPending] = useActionState(iniciarNovoCursoAction, initialState);

  if (cursos.length === 0) {
    return <p className="text-xs text-navy-400">Sem outro curso cadastrado.</p>;
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="alunoId" value={alunoId} />
      <Select name="novoCursoId" required className="w-52 text-sm">
        {cursos.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </Select>
      <Select name="periodo" required defaultValue="MATUTINO" className="w-32 text-sm">
        <option value="MATUTINO">Matutino</option>
        <option value="VESPERTINO">Vespertino</option>
        <option value="NOTURNO">Noturno</option>
      </Select>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-gold-100 hover:bg-navy-800 disabled:opacity-60"
      >
        {isPending ? "A processar..." : "Iniciar Novo Curso"}
      </button>
      {state.error ? <p className="w-full text-sm text-red-600">{state.error}</p> : null}
      {state.resultado ? (
        <p className="flex w-full items-start gap-1.5 text-sm text-green-700">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          {state.resultado}
        </p>
      ) : null}
    </form>
  );
}
