"use client";

import { useActionState } from "react";
import { Field, Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { createCadeiraCurricularAction, type CreateCadeiraCurricularState } from "@/actions/admin";

const initialState: CreateCadeiraCurricularState = {};

interface Opcao {
  id: string;
  nome: string;
}

interface CreateCadeiraCurricularFormProps {
  cursoId: string;
  disciplinas: Opcao[];
}

export function CreateCadeiraCurricularForm({ cursoId, disciplinas }: CreateCadeiraCurricularFormProps) {
  const [state, formAction, isPending] = useActionState(createCadeiraCurricularAction, initialState);

  return (
    <form
      key={JSON.stringify(state.values ?? {})}
      action={formAction}
      className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end"
    >
      <input type="hidden" name="cursoId" value={cursoId} />
      <Field label="Disciplina" htmlFor="cc-disciplina" error={state.fieldErrors?.disciplinaId}>
        <Select id="cc-disciplina" name="disciplinaId" required defaultValue={state.values?.disciplinaId}>
          {disciplinas.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nome}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Ano curricular" htmlFor="cc-ano" error={state.fieldErrors?.anoCurricular}>
        <Input
          id="cc-ano"
          name="anoCurricular"
          type="number"
          min={1}
          max={8}
          required
          defaultValue={state.values?.anoCurricular ?? 1}
        />
      </Field>
      <Field label="Semestre" htmlFor="cc-semestre" error={state.fieldErrors?.semestre}>
        <Select id="cc-semestre" name="semestre" required defaultValue={state.values?.semestre ?? "1"}>
          <option value="1">1º Semestre</option>
          <option value="2">2º Semestre</option>
        </Select>
      </Field>
      {state.error ? <p className="sm:col-span-4 text-sm text-red-600">{state.error}</p> : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "A adicionar..." : "Adicionar ao plano"}
      </Button>
    </form>
  );
}
