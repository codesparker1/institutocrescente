"use client";

import { useActionState } from "react";
import { Field, Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { createTurmaAction, type CreateTurmaState } from "@/actions/admin";

const initialState: CreateTurmaState = {};

interface CursoOption {
  id: string;
  nome: string;
}

interface CreateTurmaFormProps {
  cursos: CursoOption[];
}

export function CreateTurmaForm({ cursos }: CreateTurmaFormProps) {
  const [state, formAction, isPending] = useActionState(createTurmaAction, initialState);

  return (
    <form
      key={JSON.stringify(state.values ?? {})}
      action={formAction}
      className="grid grid-cols-1 gap-3 sm:grid-cols-5 sm:items-end"
    >
      <Field label="Curso" htmlFor="turma-curso" error={state.fieldErrors?.cursoId}>
        <Select id="turma-curso" name="cursoId" required defaultValue={state.values?.cursoId}>
          {cursos.map((curso) => (
            <option key={curso.id} value={curso.id}>
              {curso.nome}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Ano curricular" htmlFor="turma-anocurricular" error={state.fieldErrors?.anoCurricular}>
        <Select
          id="turma-anocurricular"
          name="anoCurricular"
          required
          defaultValue={state.values?.anoCurricular ?? "1"}
        >
          {[1, 2, 3, 4, 5, 6].map((ano) => (
            <option key={ano} value={ano}>
              {ano}º Ano
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Período" htmlFor="turma-periodo" error={state.fieldErrors?.periodo}>
        <Select id="turma-periodo" name="periodo" required defaultValue={state.values?.periodo ?? "MATUTINO"}>
          <option value="MATUTINO">Matutino</option>
          <option value="VESPERTINO">Vespertino</option>
          <option value="NOTURNO">Noturno</option>
        </Select>
      </Field>
      <Field label="Ano letivo (ano de início — ex.: 2026 = 2026/2027)" htmlFor="turma-ano" error={state.fieldErrors?.anoLetivo}>
        <Input
          id="turma-ano"
          name="anoLetivo"
          type="number"
          required
          defaultValue={state.values?.anoLetivo ?? 2026}
        />
      </Field>
      {state.error ? <p className="sm:col-span-5 text-sm text-red-600">{state.error}</p> : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "A criar..." : "Criar turma"}
      </Button>
    </form>
  );
}
