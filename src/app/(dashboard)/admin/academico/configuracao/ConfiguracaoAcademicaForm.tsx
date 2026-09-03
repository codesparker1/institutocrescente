"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Field, Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { DateSelect } from "@/components/ui/DateSelect";
import { atualizarConfiguracaoAcademicaAction, type ConfiguracaoAcademicaState } from "@/actions/academico";

const initialState: ConfiguracaoAcademicaState = {};

interface ConfiguracaoAcademicaFormProps {
  limiteReprovacoes: number;
  regraRetencao: "SO_REPROVADAS" | "ANO_INTEIRO";
  matriculaInicio?: string;
  matriculaFim?: string;
  anoLetivoInicio?: string;
  anoLetivoFim?: string;
  /** Ano de getAgora() (respeita o relógio simulado) — base para os limites min/max dos seletores
   * de data abaixo. Sem isto, os seletores usavam new Date().getFullYear() do relógio REAL da
   * máquina, e uma simulação avançada para 2029 ficava sem conseguir escolher datas de 2029. */
  anoDeReferencia: number;
}

export function ConfiguracaoAcademicaForm({
  limiteReprovacoes,
  regraRetencao,
  matriculaInicio,
  matriculaFim,
  anoLetivoInicio,
  anoLetivoFim,
  anoDeReferencia,
}: ConfiguracaoAcademicaFormProps) {
  const [state, formAction, isPending] = useActionState(atualizarConfiguracaoAcademicaAction, initialState);

  return (
    <form key={JSON.stringify(state.values ?? {})} action={formAction} className="flex max-w-md flex-col gap-4">
      <Field label="Limite de reprovações para avançar de ano" htmlFor="limiteReprovacoes" error={state.fieldErrors?.limiteReprovacoes}>
        <Input
          id="limiteReprovacoes"
          name="limiteReprovacoes"
          type="number"
          min={0}
          defaultValue={state.values?.limiteReprovacoes ?? limiteReprovacoes}
        />
      </Field>

      <Field label="Regra de retenção" htmlFor="regraRetencao" error={state.fieldErrors?.regraRetencao}>
        <Select id="regraRetencao" name="regraRetencao" defaultValue={state.values?.regraRetencao ?? regraRetencao}>
          <option value="SO_REPROVADAS">Só repete as cadeiras reprovadas</option>
          <option value="ANO_INTEIRO">Repete o ano inteiro</option>
        </Select>
      </Field>

      <div className="flex flex-col gap-1 border-t border-navy-50 pt-4">
        <span className="text-sm font-medium text-texto">Início do ano letivo</span>
        <DateSelect
          name="anoLetivoInicio"
          minYear={anoDeReferencia - 1}
          maxYear={anoDeReferencia + 2}
          defaultValue={state.values?.anoLetivoInicio ?? anoLetivoInicio}
        />
        {state.fieldErrors?.anoLetivoInicio ? <p className="text-xs text-red-600">{state.fieldErrors.anoLetivoInicio}</p> : null}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-texto">Fim do ano letivo</span>
        <DateSelect
          name="anoLetivoFim"
          minYear={anoDeReferencia - 1}
          maxYear={anoDeReferencia + 2}
          defaultValue={state.values?.anoLetivoFim ?? anoLetivoFim}
        />
        {state.fieldErrors?.anoLetivoFim ? (
          <p className="text-xs text-red-600">{state.fieldErrors.anoLetivoFim}</p>
        ) : (
          <p className="text-xs text-texto-suave">
            É esta data, não o fim da matrícula, que fecha o ano letivo: repõe o semestre para 1º e suspende quem não rematriculou.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1 border-t border-navy-50 pt-4">
        <span className="text-sm font-medium text-texto">Início do período de matrícula</span>
        <DateSelect
          name="matriculaInicio"
          minYear={anoDeReferencia - 1}
          maxYear={anoDeReferencia + 2}
          defaultValue={state.values?.matriculaInicio ?? matriculaInicio}
        />
        {state.fieldErrors?.matriculaInicio ? <p className="text-xs text-red-600">{state.fieldErrors.matriculaInicio}</p> : null}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-texto">Fim do período de matrícula</span>
        <DateSelect
          name="matriculaFim"
          minYear={anoDeReferencia - 1}
          maxYear={anoDeReferencia + 2}
          defaultValue={state.values?.matriculaFim ?? matriculaFim}
        />
        {state.fieldErrors?.matriculaFim ? <p className="text-xs text-red-600">{state.fieldErrors.matriculaFim}</p> : null}
      </div>

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
