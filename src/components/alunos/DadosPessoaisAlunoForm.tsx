"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { atualizarDadosPessoaisAlunoAction, type AtualizarDadosPessoaisState } from "@/actions/alunos";

const initialState: AtualizarDadosPessoaisState = {};

interface DadosPessoaisAlunoFormProps {
  alunoId: string;
  nome: string;
  numeroEstudante: string;
}

/** Editar nome/nº de estudante — só ADMIN (o próprio botão que abre isto já é gated no server). */
export function DadosPessoaisAlunoForm({ alunoId, nome, numeroEstudante }: DadosPessoaisAlunoFormProps) {
  const [state, formAction, isPending] = useActionState(atualizarDadosPessoaisAlunoAction, initialState);
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <Button type="button" variant="secondary" onClick={() => setAberto(true)} className="px-3 py-1.5 text-xs">
        <Pencil size={14} />
        Editar dados
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-lg border border-navy-100 p-3">
      <input type="hidden" name="alunoId" value={alunoId} />
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-navy-500">Nome</label>
        <Input name="nome" defaultValue={nome} required className="text-sm" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-navy-500">Nº de estudante</label>
        <Input name="numeroEstudante" defaultValue={numeroEstudante} required className="text-sm" />
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" disabled={isPending} className="px-3 py-1.5 text-xs">
          {isPending ? "A guardar..." : "Guardar"}
        </Button>
        <button type="button" onClick={() => setAberto(false)} className="text-xs text-navy-400 hover:text-navy-600">
          cancelar
        </button>
      </div>
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
