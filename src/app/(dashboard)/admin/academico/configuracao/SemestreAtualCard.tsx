"use client";

import type { FormEvent } from "react";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { alterarSemestreAction } from "@/actions/academico";

interface SemestreAtualCardProps {
  semestreAtual: 1 | 2;
  /** Disciplinas do OUTRO semestre ainda sem professor — o trabalho que a mudança vai destapar. */
  disciplinasSemProfessor: number;
  /** Disciplinas do OUTRO semestre ainda sem horário marcado. */
  disciplinasSemHorario: number;
  /** Cadeiras que o fecho do 1º semestre vai marcar a 0 por terem épocas por lançar. */
  cadeirasPorFechar: number;
  /** Cadeiras que ficariam por fechar por a época em falta nunca ter sido agendada. */
  semAvaliacaoAgendada: number;
  /** Há um ano letivo a decorrer — enquanto houver, não se volta ao 1º semestre. */
  dentroDoAnoLetivo: boolean;
}

export function SemestreAtualCard({
  semestreAtual,
  disciplinasSemProfessor,
  disciplinasSemHorario,
  cadeirasPorFechar,
  semAvaliacaoAgendada,
  dentroDoAnoLetivo,
}: SemestreAtualCardProps) {
  const proximoSemestre = semestreAtual === 1 ? 2 : 1;
  // Voltar ao 1º a meio do ano letivo reabriria um semestre já fechado a zeros (§decisão do cliente
  // 2026-08-31). A action recusa; aqui só se evita oferecer o botão que ia dar erro.
  const voltarBloqueado = semestreAtual === 2 && dentroDoAnoLetivo;

  function handleSubmit(semestre: 1 | 2) {
    return (e: FormEvent<HTMLFormElement>) => {
      // Números concretos em vez de um "se calhar falta alguma coisa": quem confirma vê o tamanho
      // do trabalho ANTES de mudar (§pedido do cliente 2026-08-29). O aviso persistente fica depois
      // no painel inicial — o confirm avisa uma vez, o cartão fica até estar feito.
      const tarefas = [
        semestre === proximoSemestre && disciplinasSemProfessor > 0
          ? `• ${disciplinasSemProfessor} disciplina(s) SEM PROFESSOR — sem professor ninguém lança notas nem marca presenças (Gestão Académica > Turmas)`
          : null,
        semestre === proximoSemestre && disciplinasSemHorario > 0
          ? `• ${disciplinasSemHorario} disciplina(s) SEM HORÁRIO — os alunos não veem aulas nenhumas (Horário e Provas)`
          : null,
      ].filter((t) => t !== null);

      const aviso =
        tarefas.length > 0
          ? `\n\nDEPOIS DE MUDAR, FICA POR FAZER:\n${tarefas.join("\n")}\n\n` +
            "Estas tarefas vão ficar assinaladas na Página Inicial até estarem feitas."
          : "\n\nAs disciplinas deste semestre já têm professor e horário — não fica nada por fazer.";

      // O fecho é irreversível dentro do ano letivo: tem de ser dito antes, com números.
      const avisoFecho =
        semestreAtual === 1 && semestre === 2
          ? "\n\nISTO FECHA O 1º SEMESTRE — NÃO SE PODE DESFAZER:\n" +
            (cadeirasPorFechar > 0
              ? `• ${cadeirasPorFechar} cadeira(s) com notas por lançar vão levar 0 nas épocas em falta e apurar o resultado (normalmente reprovado).\n`
              : "• Todas as cadeiras já têm as notas lançadas — não há zeros a atribuir.\n") +
            (semAvaliacaoAgendada > 0
              ? `• ATENÇÃO: ${semAvaliacaoAgendada} cadeira(s) ficam por fechar porque a época em falta nunca chegou a ser agendada. Agende a prova primeiro, ou ficam "Em curso".\n`
              : "") +
            "• Só volta ao 1º semestre no início do próximo ano letivo."
          : "";

      const confirmado = window.confirm(
        `Mudar o sistema para o ${semestre}º Semestre?\n\n` +
          "Isto não cria nem move nenhuma disciplina, turma ou prova — só muda qual semestre fica " +
          '"aberto". As disciplinas do outro semestre deixam de aparecer como ativas para os ' +
          "professores (continuam consultáveis, mas sem poder lançar notas)." +
          avisoFecho +
          aviso,
      );
      if (!confirmado) e.preventDefault();
    };
  }

  return (
    <Card>
      <CardHeader
        title="Semestre corrente"
        subtitle="Só as disciplinas do semestre e ano letivo correntes ficam abertas para aulas e notas. Volta a 1º Semestre sozinho no início de cada novo ano letivo."
      />
      <CardBody className="flex flex-col gap-3">
        <div className="flex gap-3">
          {([1, 2] as const).map((semestre) => {
            const bloqueado = semestre === 1 && voltarBloqueado;
            return (
              <form key={semestre} action={alterarSemestreAction} onSubmit={handleSubmit(semestre)}>
                <input type="hidden" name="semestre" value={semestre} />
                <button
                  type="submit"
                  disabled={semestre === semestreAtual || bloqueado}
                  title={bloqueado ? "O 1º semestre já foi fechado neste ano letivo" : undefined}
                  className={cn(
                    "rounded-lg border px-6 py-3 text-sm font-semibold transition-colors",
                    semestre === semestreAtual
                      ? "border-navy-700 bg-navy-700 text-gold-100"
                      : bloqueado
                        ? "cursor-not-allowed border-navy-50 bg-navy-50 text-texto-suave"
                        : "border-navy-100 bg-white text-texto hover:border-navy-300 hover:text-navy-700",
                  )}
                >
                  {semestre}º Semestre
                  {semestre === semestreAtual ? (
                    <span className="ml-2 text-xs font-normal text-gold-200">(atual)</span>
                  ) : null}
                </button>
              </form>
            );
          })}
        </div>

        {semestreAtual === 1 && cadeirasPorFechar > 0 ? (
          <p className="text-xs text-texto">
            Ao passar ao 2º semestre, <strong>{cadeirasPorFechar} cadeira(s)</strong> com notas por lançar levam 0 nas
            épocas em falta.
            {semAvaliacaoAgendada > 0 ? (
              <>
                {" "}
                <span className="text-amber-700">
                  {semAvaliacaoAgendada} ficam por fechar — a época em falta nunca foi agendada.
                </span>
              </>
            ) : null}
          </p>
        ) : null}

        {voltarBloqueado ? (
          <p className="text-xs text-texto-suave">
            O 1º semestre já foi fechado neste ano letivo. Volta a ficar disponível no início do próximo ano letivo.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
