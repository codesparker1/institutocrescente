"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { DateSelect } from "@/components/ui/DateSelect";
import { Button } from "@/components/ui/Button";
import { createProvaAction, type CreateProvaState } from "@/actions/horario";

const initialState: CreateProvaState = {};

interface DisciplinaOption {
  id: string;
  nome: string;
}

interface CreateProvaFormProps {
  disciplinas: DisciplinaOption[];
}

export function CreateProvaForm({ disciplinas }: CreateProvaFormProps) {
  const [state, formAction, isPending] = useActionState(createProvaAction, initialState);

  const primeiroErro =
    state.error ??
    state.fieldErrors?.nome ??
    state.fieldErrors?.data ??
    state.fieldErrors?.sala ??
    state.fieldErrors?.peso ??
    state.fieldErrors?.turmaDisciplinaId ??
    state.fieldErrors?.tipo;

  return (
    <div className="flex flex-col gap-2">
      <form key={JSON.stringify(state.values ?? {})} action={formAction} className="flex flex-wrap items-end gap-2">
        <Select
          name="turmaDisciplinaId"
          required
          defaultValue={state.values?.turmaDisciplinaId ?? disciplinas[0]?.id}
          className="w-44 text-xs"
        >
          {disciplinas.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nome}
            </option>
          ))}
        </Select>
        <Input name="nome" placeholder="Nome" required className="w-32 text-xs" defaultValue={state.values?.nome} />
        <Select name="tipo" required defaultValue={state.values?.tipo ?? "TESTE"} className="w-32 text-xs">
          <option value="TESTE">Teste</option>
          <option value="TRABALHO">Trabalho</option>
          <option value="EXAME_FINAL">Exame Final</option>
        </Select>
        <DateSelect
          name="data"
          minYear={new Date().getFullYear() - 1}
          maxYear={new Date().getFullYear() + 2}
          defaultValue={state.values?.data}
        />
        <Input name="sala" placeholder="Sala" required className="w-24 text-xs" defaultValue={state.values?.sala} />
        <Input
          name="peso"
          type="number"
          step="0.1"
          min={0}
          max={1}
          placeholder="Peso"
          required
          defaultValue={state.values?.peso ?? 0.3}
          className="w-16 text-xs"
        />
        <Button type="submit" variant="ghost" className="text-xs" disabled={isPending}>
          {isPending ? "A agendar..." : "Agendar"}
        </Button>
      </form>
      {primeiroErro ? <p className="text-xs text-red-600">{primeiroErro}</p> : null}
    </div>
  );
}
