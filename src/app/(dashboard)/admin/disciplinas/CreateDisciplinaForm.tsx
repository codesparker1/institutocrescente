"use client";

import { useActionState } from "react";
import { Field, Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { createDisciplinaAction, type CreateDisciplinaState } from "@/actions/admin";

const initialState: CreateDisciplinaState = {};

interface CursoOption {
  id: string;
  nome: string;
}

interface CreateDisciplinaFormProps {
  cursos: CursoOption[];
}

export function CreateDisciplinaForm({ cursos }: CreateDisciplinaFormProps) {
  const [state, formAction, isPending] = useActionState(createDisciplinaAction, initialState);

  return (
    <form
      key={JSON.stringify(state.values ?? {})}
      action={formAction}
      className="grid grid-cols-1 gap-3 sm:grid-cols-5 sm:items-end"
    >
      <Field label="Nome" htmlFor="disc-nome" error={state.fieldErrors?.nome}>
        <Input id="disc-nome" name="nome" required placeholder="Cálculo I" defaultValue={state.values?.nome} />
      </Field>
      <Field label="Código" htmlFor="disc-codigo" error={state.fieldErrors?.codigo}>
        <Input id="disc-codigo" name="codigo" required placeholder="ENG-301" defaultValue={state.values?.codigo} />
      </Field>
      <Field label="Carga horária" htmlFor="disc-carga" error={state.fieldErrors?.cargaHoraria}>
        <Input
          id="disc-carga"
          name="cargaHoraria"
          type="number"
          min={1}
          required
          defaultValue={state.values?.cargaHoraria ?? 45}
        />
      </Field>
      <Field label="Curso" htmlFor="disc-curso" error={state.fieldErrors?.cursoId}>
        <Select id="disc-curso" name="cursoId" required defaultValue={state.values?.cursoId}>
          {cursos.map((curso) => (
            <option key={curso.id} value={curso.id}>
              {curso.nome}
            </option>
          ))}
        </Select>
      </Field>
      {state.error ? <p className="sm:col-span-5 text-sm text-red-600">{state.error}</p> : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "A adicionar..." : "Adicionar"}
      </Button>
    </form>
  );
}
