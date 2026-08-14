"use client";

import { useActionState } from "react";
import { Field, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { createEmolumentoAction, type CreateEmolumentoState } from "@/actions/admin";

const initialState: CreateEmolumentoState = {};

export function CreateEmolumentoForm() {
  const [state, formAction, isPending] = useActionState(createEmolumentoAction, initialState);

  return (
    <form
      key={JSON.stringify(state.values ?? {})}
      action={formAction}
      className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end"
    >
      <Field label="Nome" htmlFor="emolumento-nome" error={state.fieldErrors?.nome}>
        <Input
          id="emolumento-nome"
          name="nome"
          required
          placeholder="Declaração de matrícula"
          defaultValue={state.values?.nome}
        />
      </Field>
      <Field label="Descrição (opcional)" htmlFor="emolumento-descricao" error={state.fieldErrors?.descricao}>
        <Input
          id="emolumento-descricao"
          name="descricao"
          placeholder="Emitida pela secretaria em 24h"
          defaultValue={state.values?.descricao}
        />
      </Field>
      <Field label="Valor (Kz)" htmlFor="emolumento-valor" error={state.fieldErrors?.valor}>
        <Input
          id="emolumento-valor"
          name="valor"
          type="number"
          min={0}
          step="0.01"
          required
          defaultValue={state.values?.valor}
        />
      </Field>
      {state.error ? <p className="sm:col-span-4 text-sm text-red-600">{state.error}</p> : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "A adicionar..." : "Adicionar"}
      </Button>
    </form>
  );
}
