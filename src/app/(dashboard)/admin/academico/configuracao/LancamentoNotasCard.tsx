"use client";

import type { FormEvent } from "react";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { cn, formatDate } from "@/lib/utils";
import { alterarLancamentoNotasAction } from "@/actions/academico";

interface LancamentoNotasCardProps {
  aberto: boolean;
  /** Desde quando está neste estado — a janela não tem data-limite, é esta a única referência. */
  alteradoEm: Date | null;
  /**
   * Cadeiras de aluno ainda sem nota numa época JÁ AGENDADA — as que um professor consegue lançar
   * agora, e que ficam por lançar se a janela fechar. Excluídas as de épocas nunca agendadas, que o
   * professor não conseguiria lançar de qualquer forma.
   */
  cadeirasPorLancar: number;
}

/**
 * Interruptor manual da janela de lançamento de notas (§decisão do cliente 2026-09-02). Irmão do
 * SemestreAtualCard e a seguir-lhe as convenções: as consequências são contadas no servidor e
 * mostradas ANTES de confirmar, não descobertas depois.
 */
export function LancamentoNotasCard({ aberto, alteradoEm, cadeirasPorLancar }: LancamentoNotasCardProps) {
  function handleSubmit(abrir: boolean) {
    return (e: FormEvent<HTMLFormElement>) => {
      const mensagem = abrir
        ? "Abrir o lançamento de notas?\n\n" +
          "Todos os professores passam a poder lançar e corrigir notas das suas disciplinas do " +
          "semestre e ano letivo correntes. Continua a não ser possível lançar a nota de uma prova " +
          "que ainda não se realizou.\n\n" +
          "A janela fica aberta até alguém a fechar — NÃO fecha sozinha."
        : "Fechar o lançamento de notas?\n\n" +
          "Nenhum professor passa a conseguir lançar ou corrigir notas — os campos da pauta ficam " +
          "bloqueados em todas as disciplinas.\n\n" +
          (cadeirasPorLancar > 0
            ? `FICA POR LANÇAR:\n• ${cadeirasPorLancar} cadeira(s) de aluno ainda sem nota numa época já agendada.\n` +
              "Ficam nesse estado até alguém reabrir a janela, ou até o fecho do semestre lhes atribuir 0.\n\n"
            : "Não há neste momento nenhuma nota por lançar.\n\n") +
          "O DAAC e a ADMIN continuam a lançar por Gestão Académica > Notas. Pode reabrir a qualquer momento.";

      if (!window.confirm(mensagem)) e.preventDefault();
    };
  }

  return (
    <Card>
      <CardHeader
        title="Lançamento de notas"
        subtitle="Enquanto estiver aberto, os professores lançam notas das suas disciplinas. Não fecha sozinho — abre e fecha por decisão do DAAC."
      />
      <CardBody className="flex flex-col gap-3">
        <div className="flex gap-3">
          {([true, false] as const).map((abrir) => (
            <form key={String(abrir)} action={alterarLancamentoNotasAction} onSubmit={handleSubmit(abrir)}>
              <input type="hidden" name="abrir" value={abrir ? "1" : "0"} />
              <button
                type="submit"
                disabled={aberto === abrir}
                className={cn(
                  "rounded-lg border px-6 py-3 text-sm font-semibold transition-colors",
                  aberto === abrir
                    ? abrir
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-navy-700 bg-navy-700 text-gold-100"
                    : "border-navy-100 bg-white text-navy-500 hover:border-navy-300 hover:text-navy-700",
                )}
              >
                {abrir ? "Aberto" : "Fechado"}
                {aberto === abrir ? <span className="ml-2 text-xs font-normal opacity-70">(atual)</span> : null}
              </button>
            </form>
          ))}
        </div>

        <p className="text-xs text-navy-500">
          {aberto ? (
            <>
              Os professores podem lançar notas
              {alteradoEm ? ` desde ${formatDate(alteradoEm)}` : " desde a instalação"}.
              {cadeirasPorLancar > 0 ? (
                <> Há <strong>{cadeirasPorLancar} cadeira(s)</strong> ainda por lançar.</>
              ) : (
                <> Não há nenhuma nota por lançar.</>
              )}
            </>
          ) : (
            <>
              Nenhum professor consegue lançar notas
              {alteradoEm ? ` desde ${formatDate(alteradoEm)}` : ""}. Só o DAAC e a ADMIN lançam, por Gestão
              Académica &gt; Notas.
            </>
          )}
        </p>
      </CardBody>
    </Card>
  );
}
