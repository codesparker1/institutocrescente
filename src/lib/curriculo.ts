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

function inicioDoDia(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

/**
 * Suspende automaticamente quem não veio fazer a rematrícula (§4.2/Fase 8b): depois de
 * `matriculaFim` passar, todo o Aluno ATIVO cuja Matricula mais recente aponta a um ano letivo
 * anterior ao corrente passa a TRANCADO (e essa Matricula a TRANCADA) — fica associado ao ano
 * onde parou, e nunca mais aparece nas turmas do ano novo, porque nunca ganha Matricula nova.
 * Mesmo padrão preguiçoso de garantirCobrancasGeradas (financeiro.ts): corre no máximo uma vez
 * por dia civil, reclamando o "turno" com um updateMany condicional. Sem cron horário.
 */
export async function garantirSuspensaoAutomatica(): Promise<void> {
  const config = await prisma.configuracaoAcademica.findUnique({ where: { id: "config" } });
  if (!config?.matriculaFim) return;

  const agora = new Date();
  if (agora <= config.matriculaFim) return;
  if (config.ultimaSuspensaoEm && inicioDoDia(config.ultimaSuspensaoEm).getTime() === inicioDoDia(agora).getTime()) {
    return;
  }

  const reclamado = await prisma.configuracaoAcademica.updateMany({
    where: {
      id: "config",
      OR: [{ ultimaSuspensaoEm: null }, { ultimaSuspensaoEm: { lt: inicioDoDia(agora) } }],
    },
    data: { ultimaSuspensaoEm: agora },
  });
  if (reclamado.count === 0) return;

  const anoLetivoCorrente = agora.getFullYear();
  const alunosAtivos = await prisma.aluno.findMany({
    where: { status: "ATIVO" },
    select: {
      id: true,
      matriculas: {
        orderBy: { turma: { anoLetivo: "desc" } },
        take: 1,
        select: { id: true, turma: { select: { anoLetivo: true } } },
      },
    },
  });

  const aSuspender = alunosAtivos.filter((a) => {
    const ultimaMatricula = a.matriculas[0];
    return ultimaMatricula && ultimaMatricula.turma.anoLetivo < anoLetivoCorrente;
  });
  if (aSuspender.length === 0) return;

  await prisma.$transaction([
    prisma.aluno.updateMany({ where: { id: { in: aSuspender.map((a) => a.id) } }, data: { status: "TRANCADO" } }),
    prisma.matricula.updateMany({
      where: { id: { in: aSuspender.map((a) => a.matriculas[0].id) } },
      data: { status: "TRANCADA" },
    }),
  ]);
}
