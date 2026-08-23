"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Field, Input } from "@/components/ui/Input";
import { atualizarConfiguracaoFinanceiraAction, type ConfiguracaoFinanceiraState } from "@/actions/financeiro";

const initialState: ConfiguracaoFinanceiraState = {};

interface ConfiguracaoFormProps {
  bloqueioAtivo: boolean;
  toleranciaDias: number;
  diaVencimento: number;
  valorMulta: number;
  valorMultaRematriculaTardia: number;
}

export function ConfiguracaoForm({
  bloqueioAtivo,
  toleranciaDias,
  diaVencimento,
  valorMulta,
  valorMultaRematriculaTardia,
}: ConfiguracaoFormProps) {
  const [state, formAction, isPending] = useActionState(atualizarConfiguracaoFinanceiraAction, initialState);

  return (
    <form
      key={JSON.stringify(state.values ?? {})}
      action={formAction}
      className="flex flex-col gap-4 max-w-md"
    >
      <label className="flex items-center gap-2 text-sm font-medium text-navy-700">
        <input
          type="checkbox"
          name="bloqueioAtivo"
          defaultChecked={bloqueioAtivo}
          className="h-4 w-4 rounded border-navy-200"
        />
        Bloquear acesso de alunos com propinas em atraso
      </label>

      <Field label="Dias de tolerância" htmlFor="toleranciaDias" error={state.fieldErrors?.toleranciaDias}>
        <Input
          id="toleranciaDias"
          name="toleranciaDias"
          type="number"
          min={0}
          max={90}
          defaultValue={state.values?.toleranciaDias ?? toleranciaDias}
        />
      </Field>

      <Field label="Dia de vencimento" htmlFor="diaVencimento" error={state.fieldErrors?.diaVencimento}>
        <Input
          id="diaVencimento"
          name="diaVencimento"
          type="number"
          min={1}
          max={28}
          defaultValue={state.values?.diaVencimento ?? diaVencimento}
        />
      </Field>

      <Field label="Valor da multa (Kz)" htmlFor="valorMulta" error={state.fieldErrors?.valorMulta}>
        <Input
          id="valorMulta"
          name="valorMulta"
          type="number"
          min={0}
          step="0.01"
          defaultValue={state.values?.valorMulta ?? valorMulta}
        />
      </Field>

      <Field
        label="Multa por rematrícula tardia (Kz)"
        htmlFor="valorMultaRematriculaTardia"
        error={state.fieldErrors?.valorMultaRematriculaTardia}
      >
        <Input
          id="valorMultaRematriculaTardia"
          name="valorMultaRematriculaTardia"
          type="number"
          min={0}
          step="0.01"
          defaultValue={state.values?.valorMultaRematriculaTardia ?? valorMultaRematriculaTardia}
        />
        <p className="mt-1 text-xs text-navy-400">
          Cobrada (uma vez, como multa órfã) quando a ADMIN rematrícula um aluno fora do período de matrícula.
          0 = desligada. Não bloqueia o aluno — só a propina bloqueia.
        </p>
      </Field>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

      {state.success ? (
        <p className="flex items-center gap-1.5 text-sm text-green-700">
          <CheckCircle2 size={16} />
          Configuração guardada.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-gold-100 hover:bg-navy-800 disabled:opacity-60"
      >
        {isPending ? "A guardar..." : "Guardar"}
      </button>
    </form>
  );
}
