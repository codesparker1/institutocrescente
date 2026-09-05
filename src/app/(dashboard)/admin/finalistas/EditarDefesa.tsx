"use client";

import { useActionState } from "react";
import { marcarDefesaAction } from "@/actions/admin";
import { formatDefesa, toIsoDateTime } from "@/lib/utils";

const initialState: { error?: string } = {};

interface EditarDefesaProps {
  inscricaoId: string;
  defesaData: Date | null;
  defesaSala: string | null;
  /** Sem orientador não se marca defesa — o passo anterior ainda não está feito. */
  temOrientador: boolean;
}

/**
 * Marcação da defesa de UM finalista (§pedido do cliente 2026-09-05) — data, hora e sala.
 *
 * Individual, e não a Avaliacao da turma-disciplina que existia antes: essa é partilhada por todos
 * os finalistas do mesmo curso e período, e fazia cada aluno ver no seu ecrã a data de outra pessoa.
 */
export function EditarDefesa({ inscricaoId, defesaData, defesaSala, temOrientador }: EditarDefesaProps) {
  const [state, formAction, isPending] = useActionState(marcarDefesaAction, initialState);

  // Retirar o orientador de uma defesa já marcada é possível (o seletor tem a opção "Sem
  // orientador"). Nesse caso a data continua à vista, em texto: escondê-la faria desaparecer do
  // ecrã uma marcação que continua de pé, e o DAAC ficava sem saber que ela existe.
  if (!temOrientador) {
    return (
      <span className="text-xs text-texto-suave">
        {defesaData ? (
          <>
            <span className="block text-texto">{formatDefesa(defesaData, defesaSala)}</span>
            Reatribua um orientador para poder alterar.
          </>
        ) : (
          "Atribua primeiro o orientador."
        )}
      </span>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="inscricaoId" value={inscricaoId} />
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="datetime-local"
          name="data"
          defaultValue={defesaData ? toIsoDateTime(defesaData) : ""}
          disabled={isPending}
          className={`rounded-md border px-2 py-1 text-xs text-texto ${defesaData ? "border-navy-100" : "border-gold-300 bg-gold-50"}`}
        />
        <input
          type="text"
          name="sala"
          defaultValue={defesaSala ?? ""}
          placeholder="Sala"
          disabled={isPending}
          className="w-20 rounded-md border border-navy-100 px-2 py-1 text-xs text-texto"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-navy-700 px-2.5 py-1.5 text-xs font-semibold text-gold-100 hover:bg-navy-800 disabled:opacity-60"
        >
          {isPending ? "..." : "Guardar"}
        </button>
      </div>
      {state.error ? <p className="max-w-xs text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
