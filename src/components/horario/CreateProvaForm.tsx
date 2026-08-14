"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { DateSelect } from "@/components/ui/DateSelect";
import { Button } from "@/components/ui/Button";
import { createProvaAction, type CreateProvaState } from "@/actions/horario";
import { EPOCA_LABEL, EPOCA_ORDEM } from "@/lib/avaliacao";

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
    state.fieldErrors?.data ??
    state.fieldErrors?.sala ??
    state.fieldErrors?.prazoLancamento ??
    state.fieldErrors?.turmaDisciplinaId ??
    state.fieldErrors?.epoca;

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
        <Select name="epoca" required defaultValue={state.values?.epoca ?? "P1"} className="w-36 text-xs">
          {EPOCA_ORDEM.map((epoca) => (
            <option key={epoca} value={epoca}>
              {EPOCA_LABEL[epoca]}
            </option>
          ))}
        </Select>
        <DateSelect
          name="data"
          minYear={new Date().getFullYear() - 1}
          maxYear={new Date().getFullYear() + 2}
          defaultValue={state.values?.data}
        />
        <Input name="sala" placeholder="Sala" required className="w-24 text-xs" defaultValue={state.values?.sala} />
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-navy-400">Prazo de lançamento</span>
          <DateSelect
            name="prazoLancamento"
            minYear={new Date().getFullYear() - 1}
            maxYear={new Date().getFullYear() + 2}
            defaultValue={state.values?.prazoLancamento}
          />
        </div>
        <Button type="submit" variant="ghost" className="text-xs" disabled={isPending}>
          {isPending ? "A agendar..." : "Agendar"}
        </Button>
      </form>
      {primeiroErro ? <p className="text-xs text-red-600">{primeiroErro}</p> : null}
    </div>
  );
}
