"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Input";
import { DateSelectIntervalo } from "@/components/ui/DateSelectIntervalo";
import { Button } from "@/components/ui/Button";
import { editarProvaAction, type EditarProvaState } from "@/actions/horario";

const initialState: EditarProvaState = {};

interface EditarProvaFormProps {
  provaId: string;
  /** Data atual da prova, em ISO — pré-preenche o seletor. */
  dataIso: string;
  salaAtual: string | null;
  /** Primeiro dia remarcável: hoje, ou o início do ano letivo se ainda não começou. */
  minIso: string;
  /** Último dia remarcável: o fim do ano letivo. */
  maxIso: string;
  onFechar: () => void;
}

/**
 * Remarcar uma prova ainda por dar (§pedido do cliente 2026-08-31). Só data e sala: a época e a
 * disciplina não se editam — mudá-las seria outra prova. A janela é a mesma da marcação, por isso
 * reutiliza DateSelectIntervalo e não deixa escolher um dia fora do ano letivo nem no passado.
 */
export function EditarProvaForm({ provaId, dataIso, salaAtual, minIso, maxIso, onFechar }: EditarProvaFormProps) {
  const [state, formAction, isPending] = useActionState(editarProvaAction, initialState);

  const primeiroErro = state.error ?? state.fieldErrors?.data ?? state.fieldErrors?.sala;

  return (
    <form action={formAction} className="flex flex-col gap-2 border-t border-navy-50 px-4 py-3">
      <input type="hidden" name="id" value={provaId} />
      <div className="flex flex-wrap items-end gap-2">
        <DateSelectIntervalo name="data" minIso={minIso} maxIso={maxIso} defaultValue={state.values?.data ?? dataIso} />
        <Input
          name="sala"
          placeholder="Sala"
          required
          className="w-24 text-xs"
          defaultValue={state.values?.sala ?? salaAtual ?? ""}
        />
        <Button type="submit" variant="ghost" className="text-xs" disabled={isPending}>
          {isPending ? "A guardar..." : "Guardar"}
        </Button>
        <Button type="button" variant="ghost" className="text-xs text-texto-suave" onClick={onFechar}>
          Cancelar
        </Button>
      </div>
      <p className="text-xs text-texto-suave">
        A partir do novo dia, o professor pode lançar a nota — desde que o lançamento esteja aberto.
      </p>
      {primeiroErro ? <p className="text-xs text-red-600">{primeiroErro}</p> : null}
    </form>
  );
}
