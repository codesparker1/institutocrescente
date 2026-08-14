"use client";

import { useActionState } from "react";
import { Field, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { createAulaAction, type CreateAulaState } from "@/actions/frequencia";

const initialState: CreateAulaState = {};

interface CreateAulaFormProps {
  turmaDisciplinaId: string;
  dataIso: string;
  dataLabel: string;
}

export function CreateAulaForm({ turmaDisciplinaId, dataIso, dataLabel }: CreateAulaFormProps) {
  const [state, formAction, isPending] = useActionState(createAulaAction, initialState);

  const erro = state.error ?? state.fieldErrors?.data ?? state.fieldErrors?.turmaDisciplinaId;

  return (
    <div className="flex flex-col gap-2">
      <form key={JSON.stringify(state.values ?? {})} action={formAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="turmaDisciplinaId" value={turmaDisciplinaId} />
        <input type="hidden" name="data" value={dataIso} />
        <Field label="Tema (opcional)" htmlFor="aula-tema" error={state.fieldErrors?.tema}>
          <Input id="aula-tema" name="tema" placeholder="Ex: Revisão para o teste" defaultValue={state.values?.tema} />
        </Field>
        <Button type="submit" variant="ghost" disabled={isPending}>
          {isPending ? "A adicionar..." : `Adicionar aula de hoje (${dataLabel})`}
        </Button>
      </form>
      {erro ? <p className="text-xs text-red-600">{erro}</p> : null}
    </div>
  );
}
