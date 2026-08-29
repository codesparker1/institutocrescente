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
}

export function SemestreAtualCard({
  semestreAtual,
  disciplinasSemProfessor,
  disciplinasSemHorario,
}: SemestreAtualCardProps) {
  const proximoSemestre = semestreAtual === 1 ? 2 : 1;

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

      const confirmado = window.confirm(
        `Mudar o sistema para o ${semestre}º Semestre?\n\n` +
          "Isto não cria nem move nenhuma disciplina, turma ou prova — só muda qual semestre fica " +
          '"aberto". As disciplinas do outro semestre deixam de aparecer como ativas para os ' +
          "professores (continuam consultáveis, mas sem poder lançar notas)." +
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
      <CardBody className="flex gap-3">
        {([1, 2] as const).map((semestre) => (
          <form key={semestre} action={alterarSemestreAction} onSubmit={handleSubmit(semestre)}>
            <input type="hidden" name="semestre" value={semestre} />
            <button
              type="submit"
              disabled={semestre === semestreAtual}
              className={cn(
                "rounded-lg border px-6 py-3 text-sm font-semibold transition-colors",
                semestre === semestreAtual
                  ? "border-navy-700 bg-navy-700 text-gold-100"
                  : "border-navy-100 bg-white text-navy-500 hover:border-navy-300 hover:text-navy-700",
              )}
            >
              {semestre}º Semestre
              {semestre === semestreAtual ? <span className="ml-2 text-xs font-normal text-gold-200">(atual)</span> : null}
            </button>
          </form>
        ))}
      </CardBody>
    </Card>
  );
}
