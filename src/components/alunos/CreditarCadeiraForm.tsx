"use client";

import { useActionState, useState } from "react";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { creditarCadeiraAction, type CreditarCadeiraState } from "@/actions/notas";

const initialState: CreditarCadeiraState = {};

interface CadeiraDisponivel {
  id: string;
  disciplinaNome: string;
  anoCurricular: number;
  /** Já tem InscricaoCadeira aqui (ex: entrada direta) — creditar converte essa inscrição em vez de criar uma nova. */
  jaInscrita: boolean;
}

interface CreditarCadeiraFormProps {
  alunoId: string;
  cadeirasDisponiveis: CadeiraDisponivel[];
}

/** Aproveitamento de uma cadeira já aprovada noutra instituição (aluno transferido) — nunca frequentada aqui. */
export function CreditarCadeiraForm({ alunoId, cadeirasDisponiveis }: CreditarCadeiraFormProps) {
  const [state, formAction, isPending] = useActionState(creditarCadeiraAction, initialState);
  const [aberto, setAberto] = useState(false);

  if (cadeirasDisponiveis.length === 0) return null;

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="text-xs font-medium text-texto hover:text-navy-700 hover:underline">
        Creditar cadeira de outra instituição
      </button>
    );
  }

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
      <input type="hidden" name="alunoId" value={alunoId} />

      <div className="flex flex-col gap-1 sm:col-span-2">
        <label className="text-xs font-medium text-texto">Cadeira</label>
        <Select name="cadeiraCurricularId" required defaultValue={cadeirasDisponiveis[0]?.id}>
          {cadeirasDisponiveis.map((c) => (
            <option key={c.id} value={c.id}>
              {c.disciplinaNome} ({c.anoCurricular}º Ano){c.jaInscrita ? " — a cursar aqui" : ""}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-texto">Nota</label>
        <Input type="number" name="notaCreditada" min={0} max={20} step={0.1} required />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-texto">Instituição de origem</label>
        <Input type="text" name="instituicaoOrigem" placeholder="Opcional" />
      </div>

      <div className="flex gap-2 sm:col-span-4">
        <Button type="submit" disabled={isPending}>
          {isPending ? "A creditar..." : "Creditar cadeira"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>

      {state.error ? <p className="sm:col-span-4 text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
