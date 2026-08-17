"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Field, Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { DateSelect } from "@/components/ui/DateSelect";
import { atualizarConfiguracaoAcademicaAction, type ConfiguracaoAcademicaState } from "@/actions/academico";
import { EPOCA_LABEL } from "@/lib/avaliacao";

const initialState: ConfiguracaoAcademicaState = {};

const CAMPOS_PRAZO = [
  { name: "diasPrazoP1" as const, label: EPOCA_LABEL.P1 },
  { name: "diasPrazoP2" as const, label: EPOCA_LABEL.P2 },
  { name: "diasPrazoExame" as const, label: EPOCA_LABEL.EXAME },
  { name: "diasPrazoRecurso" as const, label: EPOCA_LABEL.RECURSO },
  { name: "diasPrazoExameEspecial" as const, label: EPOCA_LABEL.EXAME_ESPECIAL },
];

interface ConfiguracaoAcademicaFormProps {
  limiteReprovacoes: number;
  regraRetencao: "SO_REPROVADAS" | "ANO_INTEIRO";
  matriculaInicio?: string;
  matriculaFim?: string;
  anoLetivoInicio?: string;
  anoLetivoFim?: string;
  diasPrazoP1: number;
  diasPrazoP2: number;
  diasPrazoExame: number;
  diasPrazoRecurso: number;
  diasPrazoExameEspecial: number;
}

export function ConfiguracaoAcademicaForm({
  limiteReprovacoes,
  regraRetencao,
  matriculaInicio,
  matriculaFim,
  anoLetivoInicio,
  anoLetivoFim,
  diasPrazoP1,
  diasPrazoP2,
  diasPrazoExame,
  diasPrazoRecurso,
  diasPrazoExameEspecial,
}: ConfiguracaoAcademicaFormProps) {
  const diasPorCampo: Record<(typeof CAMPOS_PRAZO)[number]["name"], number> = {
    diasPrazoP1,
    diasPrazoP2,
    diasPrazoExame,
    diasPrazoRecurso,
    diasPrazoExameEspecial,
  };
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
        <span className="text-sm font-medium text-navy-700">Início do ano letivo</span>
        <DateSelect
          name="anoLetivoInicio"
          minYear={new Date().getFullYear() - 1}
          maxYear={new Date().getFullYear() + 2}
          defaultValue={state.values?.anoLetivoInicio ?? anoLetivoInicio}
        />
        {state.fieldErrors?.anoLetivoInicio ? <p className="text-xs text-red-600">{state.fieldErrors.anoLetivoInicio}</p> : null}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-navy-700">Fim do ano letivo</span>
        <DateSelect
          name="anoLetivoFim"
          minYear={new Date().getFullYear() - 1}
          maxYear={new Date().getFullYear() + 2}
          defaultValue={state.values?.anoLetivoFim ?? anoLetivoFim}
        />
        {state.fieldErrors?.anoLetivoFim ? (
          <p className="text-xs text-red-600">{state.fieldErrors.anoLetivoFim}</p>
        ) : (
          <p className="text-xs text-navy-400">
            É esta data, não o fim da matrícula, que fecha o ano letivo: repõe o semestre para 1º e suspende quem não rematriculou.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1 border-t border-navy-50 pt-4">
        <span className="text-sm font-medium text-navy-700">Início do período de matrícula</span>
        <DateSelect
          name="matriculaInicio"
          minYear={new Date().getFullYear() - 1}
          maxYear={new Date().getFullYear() + 2}
          defaultValue={state.values?.matriculaInicio ?? matriculaInicio}
        />
        {state.fieldErrors?.matriculaInicio ? <p className="text-xs text-red-600">{state.fieldErrors.matriculaInicio}</p> : null}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-navy-700">Fim do período de matrícula</span>
        <DateSelect
          name="matriculaFim"
          minYear={new Date().getFullYear() - 1}
          maxYear={new Date().getFullYear() + 2}
          defaultValue={state.values?.matriculaFim ?? matriculaFim}
        />
        {state.fieldErrors?.matriculaFim ? <p className="text-xs text-red-600">{state.fieldErrors.matriculaFim}</p> : null}
      </div>

      <div className="flex flex-col gap-2 border-t border-navy-50 pt-4">
        <span className="text-sm font-medium text-navy-700">Prazo de lançamento — dias após a prova, por época</span>
        <div className="grid grid-cols-2 gap-3">
          {CAMPOS_PRAZO.map((campo) => (
            <Field key={campo.name} label={campo.label} htmlFor={campo.name} error={state.fieldErrors?.[campo.name]}>
              <Input
                id={campo.name}
                name={campo.name}
                type="number"
                min={0}
                defaultValue={state.values?.[campo.name] ?? diasPorCampo[campo.name]}
              />
            </Field>
          ))}
        </div>
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
