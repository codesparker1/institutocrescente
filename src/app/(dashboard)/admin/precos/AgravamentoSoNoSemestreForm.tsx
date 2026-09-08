"use client";

import { useActionState } from "react";
import { Select } from "@/components/ui/Select";
import { atualizarAgravamentoSoNoSemestreAction } from "@/actions/admin";

const initialState: { error?: string } = {};

interface AgravamentoSoNoSemestreFormProps {
  valorInicial: boolean;
}

/** Grava ao mudar a escolha, como PercentagemAgravamentoForm grava ao sair do campo. */
export function AgravamentoSoNoSemestreForm({ valorInicial }: AgravamentoSoNoSemestreFormProps) {
  const [state, formAction, isPending] = useActionState(atualizarAgravamentoSoNoSemestreAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <Select
          key={String(valorInicial)}
          name="soNoSemestreDaCadeira"
          defaultValue={String(valorInicial)}
          disabled={isPending}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="w-72"
        >
          <option value="false">Desde o início do ano letivo</option>
          <option value="true">Só a partir do semestre da cadeira</option>
        </Select>
      </div>
      <p className="text-xs text-texto-suave">
        Uma cadeira reprovada de 2º semestre ainda não tem aulas nenhumas enquanto o 1º decorre. Com &quot;Só a
        partir do semestre da cadeira&quot;, o agravamento dessa cadeira só entra na mensalidade quando o DAAC abrir
        o 2º semestre em Configuração Académica.
      </p>
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
