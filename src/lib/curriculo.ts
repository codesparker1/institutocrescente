import "server-only";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAgora } from "@/lib/tempo";
import { isUniqueConstraintViolation } from "@/lib/prisma-errors";
import type { Periodo } from "@/generated/prisma/client";

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

    // As Aula desta turma-disciplina podem já existir (aluno a entrar a meio do ano — repetição,
    // rematrícula, mudança de curso). Sem isto, o aluno aparece na pauta e no roster (que leem
    // InscricaoCadeira), mas fica invisível na marcação de presença das aulas já dadas, porque a
    // Frequencia só é criada no momento em que a Aula é criada (ver createAulaAction).
    const criadas = await prisma.inscricaoCadeira.findMany({
      where: { tentativa: 1, OR: novasInscricoes.map((n) => ({ alunoId: n.alunoId, cadeiraCurricularId: n.cadeiraCurricularId })) },
      select: { id: true, turmaDisciplinaId: true },
    });
    await backfillFrequenciasParaInscricoes(criadas);
  }
}

/**
 * Cria a Frequencia (ausente por omissão) para cada Aula já existente da turma-disciplina de cada
 * inscrição nova — sem isto, um aluno que entra a meio do ano fica invisível na marcação de
 * presença de aulas anteriores à sua inscrição, apesar de já aparecer na pauta e no roster.
 */
export async function backfillFrequenciasParaInscricoes(inscricoes: { id: string; turmaDisciplinaId: string }[]): Promise<void> {
  if (inscricoes.length === 0) return;

  const turmaDisciplinaIds = [...new Set(inscricoes.map((i) => i.turmaDisciplinaId))];
  const aulas = await prisma.aula.findMany({
    where: { turmaDisciplinaId: { in: turmaDisciplinaIds } },
    select: { id: true, turmaDisciplinaId: true },
  });
  if (aulas.length === 0) return;

  const aulaIdsPorTurmaDisciplina = new Map<string, string[]>();
  for (const aula of aulas) {
    const lista = aulaIdsPorTurmaDisciplina.get(aula.turmaDisciplinaId) ?? [];
    lista.push(aula.id);
    aulaIdsPorTurmaDisciplina.set(aula.turmaDisciplinaId, lista);
  }

  const novasFrequencias = inscricoes.flatMap((inscricao) =>
    (aulaIdsPorTurmaDisciplina.get(inscricao.turmaDisciplinaId) ?? []).map((aulaId) => ({
      aulaId,
      inscricaoCadeiraId: inscricao.id,
      presente: false,
    })),
  );

  if (novasFrequencias.length > 0) {
    await prisma.frequencia.createMany({ data: novasFrequencias, skipDuplicates: true });
  }
}

/**
 * Anos curriculares anteriores a `anoCurricularEntrada` que ainda não têm Turma criada para este
 * curso×período×anoLetivo — usado para bloquear a matrícula direta num ano > 1º (§pedido do
 * cliente: entrada direta tem de trazer as cadeiras anteriores em falta) antes de criar o aluno.
 * Devolve [] se não houver nenhum em falta (inclui o caso anoCurricularEntrada <= 1, que não
 * precisa de nenhum ano anterior).
 */
export async function anosAnterioresEmFalta(
  cursoId: string,
  periodo: Periodo,
  anoLetivo: number,
  anoCurricularEntrada: number,
): Promise<number[]> {
  if (anoCurricularEntrada <= 1) return [];
  const anosNecessarios = Array.from({ length: anoCurricularEntrada - 1 }, (_, i) => i + 1);

  const turmasExistentes = await prisma.turma.findMany({
    where: { cursoId, periodo, anoLetivo, anoCurricular: { in: anosNecessarios } },
    select: { anoCurricular: true },
  });
  const anosComTurma = new Set(turmasExistentes.map((t) => t.anoCurricular));
  return anosNecessarios.filter((ano) => !anosComTurma.has(ano));
}

/**
 * Entrada direta num ano > 1º (§pedido do cliente): inscreve o aluno em todas as cadeiras dos
 * anos curriculares anteriores, na oferta corrente (mesmo anoLetivo/período) desses anos — o
 * aluno ainda tem de as cursar aqui, ao mesmo tempo que as do ano de entrada. Chamar só depois de
 * confirmar, com `anosAnterioresEmFalta`, que todas as turmas anteriores já existem (esta função
 * não valida nem cria turmas em falta — silenciosamente ignora anos sem oferta).
 *
 * Sem Matricula nova para os anos anteriores: o aluno só fica formalmente matriculado na turma de
 * entrada, tal como uma repetição manual (criarTentativaRepeticaoAction) também não cria
 * Matricula — só a InscricaoCadeira representa "está a cursar esta cadeira".
 */
export async function inscreverCadeirasAnosAnteriores(
  alunoId: string,
  cursoId: string,
  periodo: Periodo,
  anoLetivo: number,
  anoCurricularEntrada: number,
): Promise<void> {
  if (anoCurricularEntrada <= 1) return;
  const anosNecessarios = Array.from({ length: anoCurricularEntrada - 1 }, (_, i) => i + 1);

  const turmaDisciplinas = await prisma.turmaDisciplina.findMany({
    where: { turma: { cursoId, periodo, anoLetivo, anoCurricular: { in: anosNecessarios } } },
    select: {
      id: true,
      cadeiraCurricularId: true,
      cadeiraCurricular: { select: { permiteDispensa: true, notaMinimaDispensa: true } },
    },
  });
  if (turmaDisciplinas.length === 0) return;

  // Congelamento de regras (§4.1.1) — mesmo raciocínio de sincronizarInscricoesTurma.
  const novasInscricoes = turmaDisciplinas.map((td) => ({
    alunoId,
    cadeiraCurricularId: td.cadeiraCurricularId,
    turmaDisciplinaId: td.id,
    tentativa: 1,
    ativa: true,
    permiteDispensaAplicada: td.cadeiraCurricular.permiteDispensa,
    notaMinimaDispensaAplicada: td.cadeiraCurricular.notaMinimaDispensa,
  }));
  await prisma.inscricaoCadeira.createMany({ data: novasInscricoes, skipDuplicates: true });

  // Mesma lógica de sincronizarInscricoesTurma: sem isto, o aluno fica invisível na marcação de
  // presença de aulas de anos anteriores já dadas antes da sua entrada (não deveria haver
  // nenhuma no mesmo dia da criação, mas a entrada pode acontecer a meio do ano letivo).
  const criadas = await prisma.inscricaoCadeira.findMany({
    where: { alunoId, tentativa: 1, cadeiraCurricularId: { in: turmaDisciplinas.map((td) => td.cadeiraCurricularId) } },
    select: { id: true, turmaDisciplinaId: true },
  });
  await backfillFrequenciasParaInscricoes(criadas);
}

function inicioDoDia(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

/**
 * Suspende automaticamente quem não veio fazer a rematrícula (§4.2/Fase 8b): depois de
 * `anoLetivoFim` passar, todo o Aluno ATIVO cuja Matricula mais recente aponta a um ano letivo
 * anterior ao corrente passa a TRANCADO (e essa Matricula a TRANCADA) — fica associado ao ano
 * onde parou, e nunca mais aparece nas turmas do ano novo, porque nunca ganha Matricula nova.
 * Usa `anoLetivoFim`, não `matriculaFim` — são fronteiras diferentes: a janela de matrícula é só
 * quando a Secretaria pode processar rematrículas, o ano letivo é o próprio ano académico.
 * Mesmo padrão preguiçoso de garantirCobrancasGeradas (financeiro.ts): corre no máximo uma vez
 * por dia civil, reclamando o "turno" com um updateMany condicional. Sem cron horário.
 */
export async function garantirSuspensaoAutomatica(): Promise<void> {
  const config = await prisma.configuracaoAcademica.findUnique({ where: { id: "config" } });
  if (!config?.anoLetivoFim) return;

  const agora = await getAgora();
  if (agora <= config.anoLetivoFim) return;
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

  after(async () => {
    await rolloverTurmas(agora);
    await suspenderNaoRematriculados(agora, config.semestreAtual);
  });
}

/**
 * Cria a turma do ano letivo novo para cada combinação curso×ano curricular×período que já tinha
 * turma no ano que acabou (§pedido do cliente 2026-08-18: "quando o ano letivo termina, a página
 * de turmas atualiza automaticamente, a antiga fica só como histórico"). Sem isto,
 * processarRematriculaAction rejeitava toda rematrícula com "crie a turma primeiro em Admin >
 * Turmas" — alguém tinha de pré-criar cada combinação à mão antes da época de rematrícula.
 * Copia também as TurmaDisciplina (disciplina/professor/sala) da turma antiga — decisão do
 * cliente: nasce com a mesma grelha do ano anterior, o DAAC só corrige o que mudou, em vez de
 * montar tudo de novo. A turma antiga nunca é tocada — fica exatamente como histórico.
 */
async function rolloverTurmas(agora: Date): Promise<void> {
  const anoLetivoCorrente = agora.getFullYear();
  const turmasAnoAnterior = await prisma.turma.findMany({
    where: { anoLetivo: anoLetivoCorrente - 1 },
    include: { turmaDisciplinas: true },
  });

  for (const turmaAntiga of turmasAnoAnterior) {
    let turmaNova;
    try {
      turmaNova = await prisma.turma.create({
        data: {
          cursoId: turmaAntiga.cursoId,
          anoCurricular: turmaAntiga.anoCurricular,
          periodo: turmaAntiga.periodo,
          anoLetivo: anoLetivoCorrente,
        },
      });
    } catch (error) {
      // Já rolada (corrida entre dois pedidos no mesmo dia da virada, ou reprocessamento) — só
      // continua se a turma nova ainda não tiver nenhuma TurmaDisciplina copiada.
      if (!isUniqueConstraintViolation(error)) throw error;
      turmaNova = await prisma.turma.findUniqueOrThrow({
        where: {
          cursoId_anoCurricular_periodo_anoLetivo: {
            cursoId: turmaAntiga.cursoId,
            anoCurricular: turmaAntiga.anoCurricular,
            periodo: turmaAntiga.periodo,
            anoLetivo: anoLetivoCorrente,
          },
        },
      });
      const jaTemDisciplinas = await prisma.turmaDisciplina.findFirst({ where: { turmaId: turmaNova.id } });
      if (jaTemDisciplinas) continue;
    }

    if (turmaAntiga.turmaDisciplinas.length > 0) {
      await prisma.turmaDisciplina.createMany({
        data: turmaAntiga.turmaDisciplinas.map((td) => ({
          turmaId: turmaNova.id,
          disciplinaId: td.disciplinaId,
          cadeiraCurricularId: td.cadeiraCurricularId,
          professorId: td.professorId,
          semestre: td.semestre,
          sala: td.sala,
        })),
        skipDuplicates: true,
      });
    }
  }
}

/**
 * Corre em `after()`, fora do request-response — ver o mesmo raciocínio em
 * garantirCobrancasGeradas (src/lib/financeiro.ts). Este findMany sobre todos os alunos ATIVO
 * é da mesma família de custo pesado-no-dia-da-virada que causava contenção no pool de ligações
 * sob os picos de tráfego da simulação de ano caótico.
 */
async function suspenderNaoRematriculados(agora: Date, semestreAtual: number): Promise<void> {
  // Passado o fim do ano letivo, um novo ano letivo começa — o semestre volta sempre a 1º, para o
  // DAAC não ter de se lembrar de o repor manualmente todos os anos. Incondicional (não depende de
  // haver alunos a suspender) e idempotente, porque este job corre uma vez por dia civil enquanto
  // a data atual continuar depois de `anoLetivoFim`.
  if (semestreAtual !== 1) {
    await prisma.configuracaoAcademica.update({ where: { id: "config" }, data: { semestreAtual: 1 } });
  }

  const anoLetivoCorrente = agora.getFullYear();
  // §Opção A (2026-08-24): só ATIVO é suspendível. FORMADO fica de fora de propósito — quem
  // terminou o curso (processarRematriculaAction marca FORMADO no fim-de-curso) não "trancou",
  // terminou; TRANCADO/DESISTENTE já estão fora do ciclo de matrículas.
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

  const alunoIds = aSuspender.map((a) => a.id);
  await prisma.$transaction([
    prisma.aluno.updateMany({ where: { id: { in: alunoIds } }, data: { status: "TRANCADO" } }),
    prisma.matricula.updateMany({
      where: { id: { in: aSuspender.map((a) => a.matriculas[0].id) } },
      data: { status: "TRANCADA" },
    }),
    // Sem isto, as inscrições do ano suspenso ficam `ativa=true` para sempre — mesma classe de
    // bug da rematrícula (src/lib/diagnostico.ts: regra sem-inscricao-ativa-se-inativo).
    prisma.inscricaoCadeira.updateMany({ where: { alunoId: { in: alunoIds }, ativa: true }, data: { ativa: false } }),
  ]);
}
