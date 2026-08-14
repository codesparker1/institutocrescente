"use client";

import { useActionState } from "react";
import { Field, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { createCursoAction, type CreateCursoState } from "@/actions/admin";

const initialState: CreateCursoState = {};

export function CreateCursoForm() {
  const [state, formAction, isPending] = useActionState(createCursoAction, initialState);

  return (
    <form
      key={JSON.stringify(state.values ?? {})}
      action={formAction}
      className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end"
    >
      <Field label="Nome" htmlFor="curso-nome" error={state.fieldErrors?.nome}>
        <Input
          id="curso-nome"
          name="nome"
          required
          placeholder="Engenharia Civil"
          defaultValue={state.values?.nome}
        />
      </Field>
      <Field label="Código" htmlFor="curso-codigo" error={state.fieldErrors?.codigo}>
        <Input
          id="curso-codigo"
          name="codigo"
          required
          placeholder="ENG-CIV"
          defaultValue={state.values?.codigo}
        />
      </Field>
      <Field label="Duração (anos)" htmlFor="curso-duracao" error={state.fieldErrors?.duracaoAnos}>
        <Input
          id="curso-duracao"
          name="duracaoAnos"
          type="number"
          min={1}
          max={8}
          required
          defaultValue={state.values?.duracaoAnos ?? 4}
        />
      </Field>
      <Field label="Propina mensal (Kz)" htmlFor="curso-valor-propina" error={state.fieldErrors?.valorPropina}>
        <Input
          id="curso-valor-propina"
          name="valorPropina"
          type="number"
          min={0}
          step="0.01"
          required
          defaultValue={state.values?.valorPropina ?? 15000}
        />
      </Field>
      {state.error ? <p className="sm:col-span-4 text-sm text-red-600">{state.error}</p> : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "A adicionar..." : "Adicionar"}
      </Button>
    </form>
  );
}
