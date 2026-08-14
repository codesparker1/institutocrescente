"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { TimeSelect } from "@/components/ui/TimeSelect";
import { Button } from "@/components/ui/Button";
import { createHorarioSlotAction, type CreateHorarioSlotState } from "@/actions/horario";
import { DIA_SEMANA_LABEL } from "@/lib/utils";

const initialState: CreateHorarioSlotState = {};

const DIAS = ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", "SABADO"] as const;

interface DisciplinaOption {
  id: string;
  nome: string;
}

interface CreateHorarioSlotFormProps {
  disciplinas: DisciplinaOption[];
}

export function CreateHorarioSlotForm({ disciplinas }: CreateHorarioSlotFormProps) {
  const [state, formAction, isPending] = useActionState(createHorarioSlotAction, initialState);

  const primeiroErro =
    state.error ??
    state.fieldErrors?.turmaDisciplinaId ??
    state.fieldErrors?.diaSemana ??
    state.fieldErrors?.horaInicio ??
    state.fieldErrors?.horaFim ??
    state.fieldErrors?.sala;

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
        <Select
          name="diaSemana"
          required
          defaultValue={state.values?.diaSemana ?? "SEGUNDA"}
          className="w-32 text-xs"
        >
          {DIAS.map((dia) => (
            <option key={dia} value={dia}>
              {DIA_SEMANA_LABEL[dia]}
            </option>
          ))}
        </Select>
        <TimeSelect name="horaInicio" defaultValue={state.values?.horaInicio || "08:00"} required />
        <span className="text-xs text-navy-400">até</span>
        <TimeSelect name="horaFim" defaultValue={state.values?.horaFim || "10:00"} required />
        <Input name="sala" placeholder="Sala" required className="w-24 text-xs" defaultValue={state.values?.sala} />
        <Button type="submit" variant="ghost" className="text-xs" disabled={isPending}>
          {isPending ? "A adicionar..." : "Adicionar"}
        </Button>
      </form>
      {primeiroErro ? <p className="text-xs text-red-600">{primeiroErro}</p> : null}
    </div>
  );
}
