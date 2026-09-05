"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { confirmarPagamentoMonografiaAction, reverterConfirmacaoMonografiaAction } from "@/actions/admin";
import { formatDate } from "@/lib/utils";

const initialState: { error?: string } = {};

interface ConfirmarPagamentoProps {
  alunoId: string;
  turmaId: string;
  /** null enquanto o pagamento não estiver confirmado — não há inscrição em monografia ainda. */
  inscricaoId: string | null;
  confirmadaEm: Date | null;
  confirmadaPorNome: string | null;
  /** O plano curricular deste curso/ano tem uma cadeira marcada como monografia. */
  temMonografiaNoPlano: boolean;
  /** Nota da defesa já lançada — a confirmação deixa de ser reversível. */
  temNota: boolean;
}

/**
 * Confirmação manual do pagamento da monografia (§pedido do cliente 2026-09-05). É este botão que
 * ATRIBUI a monografia ao finalista — o aluno apresenta a fatura, o DAAC confirma.
 *
 * Manual e não automático a partir do emolumento pago por decisão explícita do cliente: o nome da
 * taxa no catálogo pode ser reescrito a qualquer momento, e casar por nome partiria em silêncio.
 */
export function ConfirmarPagamento({
  alunoId,
  turmaId,
  inscricaoId,
  confirmadaEm,
  confirmadaPorNome,
  temMonografiaNoPlano,
  temNota,
}: ConfirmarPagamentoProps) {
  const [confirmarState, confirmarAction, aConfirmar] = useActionState(confirmarPagamentoMonografiaAction, initialState);
  const [reverterState, reverterAction, aReverter] = useActionState(reverterConfirmacaoMonografiaAction, initialState);

  if (!temMonografiaNoPlano) {
    return (
      <span className="text-xs text-texto-suave">
        O plano curricular deste curso não tem monografia marcada.
      </span>
    );
  }

  if (!inscricaoId) {
    return (
      <form action={confirmarAction} className="flex flex-col gap-1">
        <input type="hidden" name="alunoId" value={alunoId} />
        <input type="hidden" name="turmaId" value={turmaId} />
        <button
          type="submit"
          disabled={aConfirmar}
          className="w-fit rounded-md border border-gold-300 bg-gold-50 px-2.5 py-1.5 text-xs font-semibold text-texto hover:bg-gold-100 disabled:opacity-60"
        >
          {aConfirmar ? "A confirmar..." : "Confirmar pagamento"}
        </button>
        {confirmarState.error ? <p className="max-w-xs text-xs text-red-600">{confirmarState.error}</p> : null}
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-xs text-texto">
        <Check size={14} className="shrink-0 text-green-700" />
        {confirmadaEm ? `Confirmado a ${formatDate(confirmadaEm)}` : "Confirmado"}
      </span>
      {confirmadaPorNome ? <span className="text-xs text-texto-suave">por {confirmadaPorNome}</span> : null}
      {/* Reverter só enquanto não houver nota: depois da defesa avaliada a inscrição é registo
          académico, e apagá-la levaria a nota junto. A ação valida o mesmo do lado do servidor. */}
      {temNota ? null : (
        <form action={reverterAction}>
          <input type="hidden" name="inscricaoId" value={inscricaoId} />
          <button type="submit" disabled={aReverter} className="text-xs text-texto-suave underline hover:text-red-600 disabled:opacity-60">
            {aReverter ? "..." : "Reverter"}
          </button>
        </form>
      )}
      {reverterState.error ? <p className="max-w-xs text-xs text-red-600">{reverterState.error}</p> : null}
    </div>
  );
}
