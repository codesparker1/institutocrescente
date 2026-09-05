"use client";

import { useActionState, useState } from "react";
import { Select } from "@/components/ui/Select";
import { decidirTransicaoMonografiaAction } from "@/actions/admin";

const initialState: { error?: string } = {};

interface DecisaoTransicaoProps {
  inscricaoId: string;
  nome: string;
}

/**
 * A decisão sobre um finalista que não chegou a defender (§pedido do cliente 2026-09-05).
 *
 * Sem escolha por omissão, e com confirmação antes de gravar: as três opções não são reversíveis
 * pelo mesmo caminho — "não transita" desativa a inscrição e o aluno terá de pagar a monografia
 * outra vez. Um seletor que gravasse ao primeiro clique tornaria isso um acidente de um clique.
 */
export function DecisaoTransicao({ inscricaoId, nome }: DecisaoTransicaoProps) {
  const [state, formAction, isPending] = useActionState(decidirTransicaoMonografiaAction, initialState);
  const [decisao, setDecisao] = useState("");

  const AVISO: Record<string, string> = {
    TRANSITA_SEM_PROPINAS: `${nome} passa para o ano letivo novo sem pagar mensalidades e sem voltar a pagar a monografia.`,
    TRANSITA_COM_PROPINAS: `${nome} passa para o ano letivo novo e paga as mensalidades desse ano. Não volta a pagar a monografia.`,
    NAO_TRANSITA: `${nome} perde a inscrição na monografia. Para defender terá de pagar de novo e voltar à secretaria.`,
  };

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <input type="hidden" name="inscricaoId" value={inscricaoId} />
      <div className="flex flex-wrap items-center gap-1.5">
        <Select
          name="decisao"
          value={decisao}
          onChange={(e) => setDecisao(e.target.value)}
          disabled={isPending}
          className="py-1 text-xs"
        >
          <option value="">Decidir…</option>
          <option value="TRANSITA_SEM_PROPINAS">Transita, sem propinas</option>
          <option value="TRANSITA_COM_PROPINAS">Transita, a pagar propinas</option>
          <option value="NAO_TRANSITA">Não transita</option>
        </Select>
        <button
          type="submit"
          disabled={isPending || decisao === ""}
          className="rounded-md bg-navy-700 px-2.5 py-1.5 text-xs font-semibold text-gold-100 hover:bg-navy-800 disabled:opacity-40"
        >
          {isPending ? "..." : "Aplicar"}
        </button>
      </div>
      {/* O que vai acontecer, escrito antes de acontecer — em especial na opção que custa dinheiro ao aluno. */}
      {decisao ? <p className="max-w-md text-xs text-texto-suave">{AVISO[decisao]}</p> : null}
      {state.error ? <p className="max-w-md text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
