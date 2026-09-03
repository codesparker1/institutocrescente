"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { motivoRematriculaIndisponivel } from "@/lib/academico";
import { processarRematriculaAction, type ProcessarRematriculaState } from "@/actions/academico";
import type { AlunoStatus } from "@/generated/prisma/client";

const initialState: ProcessarRematriculaState = {};

interface RematriculaFormProps {
  alunoId: string;
  dentroDaJanela: boolean;
  /** ADMIN pode rematricular fora da janela (poder ADMIN confirmado §3.5); Secretaria não. */
  podeForaDaJanela?: boolean;
  status: AlunoStatus;
  /** Propinas DEVENDO — a mesma soma que a Server Action usa para recusar. Multas não bloqueiam. */
  saldoPropinasDevendo: number;
  /** Sem matrícula anterior não há rematrícula: é uma Nova Matrícula. */
  temMatriculaAnterior: boolean;
}

/**
 * §pedido do cliente 2026-09-03: "só ter informação quando uma condição é encontrada". Antes o
 * cartão explicava sempre como a rematrícula funciona e oferecia o botão ativo a toda a gente —
 * incluindo a um FORMADO ou DESISTENTE, que só descobria a recusa depois de carregar. As condições
 * que a Server Action verifica são todas conhecidas à partida, por isso são ditas aqui: o botão só
 * está ativo quando vai mesmo funcionar, e o texto diz o que falta em vez de explicar o mecanismo.
 *
 * A verificação continua na Server Action, que é a que conta — isto é a primeira barreira, não a
 * única.
 */
export function RematriculaForm({
  alunoId,
  dentroDaJanela,
  podeForaDaJanela,
  status,
  saldoPropinasDevendo,
  temMatriculaAnterior,
}: RematriculaFormProps) {
  const [state, formAction, isPending] = useActionState(processarRematriculaAction, initialState);

  const motivo = motivoRematriculaIndisponivel({
    status,
    temMatriculaAnterior,
    saldoPropinasDevendo,
    dentroDaJanela,
    podeForaDaJanela: Boolean(podeForaDaJanela),
  });

  if (motivo) {
    const texto =
      motivo === "FORMADO"
        ? "Aluno já formado — concluiu o curso, não há ano seguinte para onde avançar."
        : motivo === "DESISTENTE"
          ? "Aluno desistente — a reativação (ADMIN) tem de vir primeiro."
          : motivo === "SEM_MATRICULA"
            ? "Aluno sem matrícula anterior — use a Nova Matrícula."
            : motivo === "COM_DIVIDA"
              ? `${formatCurrency(saldoPropinasDevendo)} em mensalidades por pagar — confirme os pagamentos em Situação Financeira primeiro. (As multas não bloqueiam.)`
              : "Fora do período de matrícula.";
    return <p className="text-xs text-texto-suave">{texto}</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="alunoId" value={alunoId} />
      {!dentroDaJanela && podeForaDaJanela ? (
        <p className="text-xs text-amber-700">
          Fora do período de matrícula — a rematrícula tardia é um poder exclusivo da ADMIN e pode gerar multa tardia se
          estiver configurada.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-gold-100 hover:bg-navy-800 disabled:opacity-60"
      >
        {isPending ? "A processar..." : "Processar Rematrícula"}
      </button>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.resultado ? (
        <p className="flex items-start gap-1.5 text-sm text-green-700">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          {state.resultado}
        </p>
      ) : null}
    </form>
  );
}
