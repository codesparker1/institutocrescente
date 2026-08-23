/**
 * scripts/seed-teste-5-anos.ts só semeia o currículo do 1º ano (2 CadeiraCurricular, 2
 * TurmaDisciplina) — não existe nenhum ano curricular 2/3/4 na BD. `rolloverTurmas`
 * (src/lib/curriculo.ts) só ROLA para a frente uma Turma×anoCurricular que já existia no ano
 * letivo anterior — nunca inventa uma camada nova de anoCurricular. Sem isto, a primeira
 * rematrícula de qualquer aluno (1º→2º ano) falharia sempre com "não existe turma de 2º Ano",
 * o que testaria só o próprio limite do sistema, não os cenários dos 5 alunos.
 *
 * Por isso o script cria aqui, uma vez no arranque, o currículo dos anos 2-4 (mesmas duas
 * disciplinas do 1º ano, mesma estrutura semestral) — decisão de âmbito: a simulação testa
 * rematrícula/financeiro/notas, não a UI de autoria de currículo (Admin > Turmas/Disciplinas),
 * por isso o setup usa Prisma direto em vez de percorrer essa UI aluno a aluno.
 */
import type { PrismaClient } from "../../../src/generated/prisma/client";

export async function garantirCurriculoAnos2a4(prisma: PrismaClient): Promise<void> {
  const curso = await prisma.curso.findFirstOrThrow();
  const progI = await prisma.disciplina.findFirstOrThrow({ where: { nome: "Programação I" } });
  const basesDados = await prisma.disciplina.findFirstOrThrow({ where: { nome: "Bases de Dados" } });

  for (const anoCurricular of [2, 3, 4]) {
    await prisma.cadeiraCurricular.upsert({
      where: { cursoId_disciplinaId_anoCurricular_semestre: { cursoId: curso.id, disciplinaId: progI.id, anoCurricular, semestre: 1 } },
      update: {},
      create: { cursoId: curso.id, disciplinaId: progI.id, anoCurricular, semestre: 1 },
    });
    await prisma.cadeiraCurricular.upsert({
      where: { cursoId_disciplinaId_anoCurricular_semestre: { cursoId: curso.id, disciplinaId: basesDados.id, anoCurricular, semestre: 2 } },
      update: {},
      create: { cursoId: curso.id, disciplinaId: basesDados.id, anoCurricular, semestre: 2 },
    });
  }
}

/**
 * Garante que existe Turma+TurmaDisciplina para (anoCurricular, anoLetivo) antes de qualquer
 * rematrícula tentar avançar um aluno para lá — mesma estrutura que `rolloverTurmas` cria
 * (2 TurmaDisciplina, um professor por disciplina), só que para uma camada de anoCurricular que
 * nunca existiu antes, não uma que está a ser rolada de um ano letivo para o seguinte.
 * Idempotente — sem efeito se a Turma já existir (ex.: já criada por rolloverTurmas quando
 * `garantirSuspensaoAutomatica` já tinha visto essa combinação num ano letivo anterior).
 */
export async function garantirTurmaAnoCurricular(prisma: PrismaClient, anoCurricular: number, anoLetivo: number): Promise<void> {
  const curso = await prisma.curso.findFirstOrThrow();

  // upsert em vez de findUnique+create: a mesma combinação (anoCurricular, anoLetivo) é pedida duas
  // vezes em iterações diferentes do loop principal (pré-criada como "ano seguinte" numa iteração,
  // depois pedida de novo como "ano corrente" na iteração seguinte) — um upsert nunca colide com
  // uma corrida real (retry, cancelamento a meio, etc.), ao contrário de um check-then-create.
  const turma = await prisma.turma.upsert({
    where: { cursoId_anoCurricular_periodo_anoLetivo: { cursoId: curso.id, anoCurricular, periodo: "MATUTINO", anoLetivo } },
    update: {},
    create: { cursoId: curso.id, anoCurricular, periodo: "MATUTINO", anoLetivo },
  });
  const jaTemDisciplinas = await prisma.turmaDisciplina.findFirst({ where: { turmaId: turma.id } });
  if (jaTemDisciplinas) return;

  const [cadeiraProgI, cadeiraBasesDados] = await Promise.all([
    prisma.cadeiraCurricular.findFirstOrThrow({ where: { cursoId: curso.id, anoCurricular, semestre: 1 } }),
    prisma.cadeiraCurricular.findFirstOrThrow({ where: { cursoId: curso.id, anoCurricular, semestre: 2 } }),
  ]);
  const [professor1, professor2] = await Promise.all([
    prisma.professor.findFirstOrThrow({ where: { especialidade: "Engenharia de Software" } }),
    prisma.professor.findFirstOrThrow({ where: { especialidade: "Bases de Dados" } }),
  ]);

  await prisma.turmaDisciplina.createMany({
    data: [
      { turmaId: turma.id, disciplinaId: cadeiraProgI.disciplinaId, cadeiraCurricularId: cadeiraProgI.id, professorId: professor1.id, semestre: 1, sala: "Lab 1" },
      { turmaId: turma.id, disciplinaId: cadeiraBasesDados.disciplinaId, cadeiraCurricularId: cadeiraBasesDados.id, professorId: professor2.id, semestre: 2, sala: "Lab 2" },
    ],
    skipDuplicates: true,
  });
}

/**
 * Caso especial do Domingos: ele reprova Bases de Dados do 2º ANO CURRICULAR e avança na mesma
 * para o 3º (decidirRematricula: 1 reprovação <= limiteReprovacoes=2 → AVANCA, repetindo só essa
 * cadeira — ver src/lib/academico.ts). processarRematriculaAction procura a "oferta atual" da
 * repetição por `cadeiraCurricularId` (a CadeiraCurricular do 2º ano) dentro da Turma do ANO LETIVO
 * ALVO (a mesma turma do 3º ano curricular para onde ele avança) — sem uma TurmaDisciplina que
 * ligue essa cadeira de 2º ano a essa turma de 3º ano, a repetição cai no ramo "sem oferta atual"
 * (aviso, sem crash, mas a InscricaoCadeira antiga fica presa ao ano anterior — dispara
 * `inscricao-ativa-ano-anterior` no diagnóstico). Cria essa oferta explicitamente, para o cenário
 * testar o caminho normal de repetição em vez do caminho de aviso/fallback.
 */
export async function garantirOfertaRepeticaoBasesDados(prisma: PrismaClient, anoCurricularOrigem: number, turmaAlvoId: string): Promise<void> {
  const curso = await prisma.curso.findFirstOrThrow();
  const cadeiraOrigem = await prisma.cadeiraCurricular.findFirstOrThrow({ where: { cursoId: curso.id, anoCurricular: anoCurricularOrigem, semestre: 2 } });
  const professor2 = await prisma.professor.findFirstOrThrow({ where: { especialidade: "Bases de Dados" } });

  const existente = await prisma.turmaDisciplina.findFirst({ where: { turmaId: turmaAlvoId, cadeiraCurricularId: cadeiraOrigem.id } });
  if (existente) return;

  await prisma.turmaDisciplina.create({
    data: {
      turmaId: turmaAlvoId,
      disciplinaId: cadeiraOrigem.disciplinaId,
      cadeiraCurricularId: cadeiraOrigem.id,
      professorId: professor2.id,
      semestre: 2,
      sala: "Lab 2 (repetição)",
    },
  });
}
