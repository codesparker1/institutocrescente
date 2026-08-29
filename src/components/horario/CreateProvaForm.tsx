"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { DateSelect } from "@/components/ui/DateSelect";
import { Button } from "@/components/ui/Button";
import { createProvaAction, type CreateProvaState } from "@/actions/horario";
import { EPOCA_LABEL, EPOCA_ORDEM } from "@/lib/avaliacao";
import type { Epoca } from "@/generated/prisma/client";

const initialState: CreateProvaState = {};

interface DisciplinaOption {
  id: string;
  nome: string;
  /** Épocas já agendadas para esta disciplina — definem qual é a próxima marcável. */
  epocasAgendadas: Epoca[];
}

interface CreateProvaFormProps {
  disciplinas: DisciplinaOption[];
}

/**
 * A próxima época por marcar: a primeira de EPOCA_ORDEM que ainda não tenha avaliação. Uma turma que
 * já tem P1 e P2 só pode marcar Exame — oferecer as cinco sempre era o que deixava marcar P2 sem P1
 * (§pedido do cliente 2026-08-28). Devolve null quando as cinco já estão marcadas.
 *
 * Espelha motivoAgendamentoInvalido, que continua a ser a barreira real na Server Action — isto é
 * só para o DAAC não ter de descobrir a regra por tentativa e erro.
 */
function proximaEpocaAgendavel(agendadas: Epoca[]): Epoca | null {
  return EPOCA_ORDEM.find((epoca) => !agendadas.includes(epoca)) ?? null;
}

export function CreateProvaForm({ disciplinas }: CreateProvaFormProps) {
  const [state, formAction, isPending] = useActionState(createProvaAction, initialState);
  const [disciplinaId, setDisciplinaId] = useState(state.values?.turmaDisciplinaId ?? disciplinas[0]?.id ?? "");

  const selecionada = disciplinas.find((d) => d.id === disciplinaId) ?? disciplinas[0];
  const proxima = selecionada ? proximaEpocaAgendavel(selecionada.epocasAgendadas) : null;

  const primeiroErro =
    state.error ??
    state.fieldErrors?.data ??
    state.fieldErrors?.sala ??
    state.fieldErrors?.turmaDisciplinaId ??
    state.fieldErrors?.epoca;

  return (
    <div className="flex flex-col gap-2">
      <form key={JSON.stringify(state.values ?? {})} action={formAction} className="flex flex-wrap items-end gap-2">
        <Select
          name="turmaDisciplinaId"
          required
          value={disciplinaId}
          onChange={(e) => setDisciplinaId(e.target.value)}
          className="w-44 text-xs"
        >
          {disciplinas.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nome}
            </option>
          ))}
        </Select>
        {/* Um único valor, não um seletor: a época é determinada pela cascata, não escolhida. */}
        <div className="flex h-9 items-center rounded-lg border border-navy-100 bg-navy-50 px-3 text-xs font-medium text-navy-600">
          {proxima ? EPOCA_LABEL[proxima] : "Todas as épocas agendadas"}
        </div>
        {proxima ? <input type="hidden" name="epoca" value={proxima} /> : null}
        <DateSelect
          name="data"
          minYear={new Date().getFullYear() - 1}
          maxYear={new Date().getFullYear() + 2}
          defaultValue={state.values?.data}
        />
        <Input name="sala" placeholder="Sala" required className="w-24 text-xs" defaultValue={state.values?.sala} />
        <Button type="submit" variant="ghost" className="text-xs" disabled={isPending || !proxima}>
          {isPending ? "A agendar..." : "Agendar"}
        </Button>
      </form>
      {proxima && proxima !== "P1" ? (
        <p className="text-xs text-navy-400">
          As épocas seguem a ordem P1 → P2 → Exame → Recurso → Exame Especial, e cada uma tem de ser marcada para
          depois da anterior.
        </p>
      ) : null}
      {primeiroErro ? <p className="text-xs text-red-600">{primeiroErro}</p> : null}
    </div>
  );
}
