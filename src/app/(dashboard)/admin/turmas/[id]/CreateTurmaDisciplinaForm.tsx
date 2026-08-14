"use client";

import { useActionState } from "react";
import { Field, Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { createTurmaDisciplinaAction, type CreateTurmaDisciplinaState } from "@/actions/admin";

const initialState: CreateTurmaDisciplinaState = {};

interface Opcao {
  id: string;
  nome: string;
}

interface CadeiraOpcao {
  id: string;
  semestre: number;
  disciplina: { nome: string };
}

interface CreateTurmaDisciplinaFormProps {
  turmaId: string;
  cadeirasCurriculares: CadeiraOpcao[];
  professores: Opcao[];
}

export function CreateTurmaDisciplinaForm({ turmaId, cadeirasCurriculares, professores }: CreateTurmaDisciplinaFormProps) {
  const [state, formAction, isPending] = useActionState(createTurmaDisciplinaAction, initialState);

  return (
    <form
      key={JSON.stringify(state.values ?? {})}
      action={formAction}
      className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end"
    >
      <input type="hidden" name="turmaId" value={turmaId} />
      <Field label="Cadeira" htmlFor="td-cadeira" error={state.fieldErrors?.cadeiraCurricularId}>
        <Select id="td-cadeira" name="cadeiraCurricularId" required defaultValue={state.values?.cadeiraCurricularId}>
          {cadeirasCurriculares.map((cadeira) => (
            <option key={cadeira.id} value={cadeira.id}>
              {cadeira.disciplina.nome} · {cadeira.semestre}º Semestre
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Professor" htmlFor="td-professor" error={state.fieldErrors?.professorId}>
        <Select id="td-professor" name="professorId" required defaultValue={state.values?.professorId}>
          {professores.map((professor) => (
            <option key={professor.id} value={professor.id}>
              {professor.nome}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Sala" htmlFor="td-sala" error={state.fieldErrors?.sala}>
        <Input id="td-sala" name="sala" required placeholder="Sala 3" defaultValue={state.values?.sala} />
      </Field>
      {state.error ? <p className="sm:col-span-4 text-sm text-red-600">{state.error}</p> : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "A atribuir..." : "Atribuir"}
      </Button>
    </form>
  );
}
