import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Garante que todo aluno com matrícula ativa nesta turma tem uma InscricaoCadeira (tentativa 1,
 * ativa) para cada CadeiraCurricular oferecida pelas TurmaDisciplina da turma. Idempotente — só
 * cria o que falta, nunca duplica nem mexe em inscrições já existentes (incluindo repetições).
 *
 * Chamada depois de matricular um aluno numa turma, e depois de atribuir uma nova disciplina a
 * uma turma já com alunos — nos dois casos pode haver combinações aluno×cadeira em falta.
 */
export async function sincronizarInscricoesTurma(turmaId: string): Promise<void> {
  const [matriculas, turmaDisciplinas] = await Promise.all([
    prisma.matricula.findMany({ where: { turmaId, status: "ATIVA" }, select: { alunoId: true } }),
    prisma.turmaDisciplina.findMany({
      where: { turmaId },
      select: { id: true, cadeiraCurricularId: true, cadeiraCurricular: { select: { permiteDispensa: true, notaMinimaDispensa: true } } },
    }),
  ]);
  if (matriculas.length === 0 || turmaDisciplinas.length === 0) return;

  const alunoIds = matriculas.map((m) => m.alunoId);
  const cadeiraCurricularIds = turmaDisciplinas.map((td) => td.cadeiraCurricularId);

  const inscricoesExistentes = await prisma.inscricaoCadeira.findMany({
    where: { alunoId: { in: alunoIds }, cadeiraCurricularId: { in: cadeiraCurricularIds } },
    select: { alunoId: true, cadeiraCurricularId: true },
  });
  const jaInscrito = new Set(inscricoesExistentes.map((i) => `${i.alunoId}:${i.cadeiraCurricularId}`));

  // Congelamento de regras (§4.1.1, Fase 6): copia as regras de dispensa da cadeira NESTE momento
  // — calcularNotaFinal usa sempre estes valores, nunca os atuais da CadeiraCurricular.
  const novasInscricoes = alunoIds.flatMap((alunoId) =>
    turmaDisciplinas
      .filter((td) => !jaInscrito.has(`${alunoId}:${td.cadeiraCurricularId}`))
      .map((td) => ({
        alunoId,
        cadeiraCurricularId: td.cadeiraCurricularId,
        turmaDisciplinaId: td.id,
        tentativa: 1,
        ativa: true,
        permiteDispensaAplicada: td.cadeiraCurricular.permiteDispensa,
        notaMinimaDispensaAplicada: td.cadeiraCurricular.notaMinimaDispensa,
      })),
  );

  if (novasInscricoes.length > 0) {
    await prisma.inscricaoCadeira.createMany({ data: novasInscricoes, skipDuplicates: true });
  }
}
