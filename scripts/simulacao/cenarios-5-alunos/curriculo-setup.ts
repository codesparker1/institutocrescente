/**
 * Setup curricular da simulação — agora lê o currículo canónico partilhado
 * (scripts/curriculo-faculdade.ts), o mesmo materializado pelo seed: cada ano tem as suas
 * disciplinas, cada disciplina com o seu professor próprio (§faculdade-de-verdade 2026-08-25).
 *
 * `garantirCurriculoAnos2a4` já não precisa de criar CadeiraCurricular (o seed cria os 4 anos);
 * mantida como verificação barata — falha cedo e com mensagem clara se a BD não estiver seedada.
 *
 * `garantirTurmaAnoCurricular` mantém o papel original: garantir Turma+TurmaDisciplina para
 * (anoCurricular, anoLetivo) antes de qualquer rematrícula tentar avançar um aluno para lá,
 * agora com o professor CERTO de cada cadeira em vez dos mesmos 2 professores em todos os anos.
 */
import type { PrismaClient } from "../../../src/generated/prisma/client";
import { CURRICULO } from "../../curriculo-faculdade";

export async function garantirCurriculoAnos2a4(prisma: PrismaClient): Promise<void> {
  const faltam = await prisma.cadeiraCurricular.findMany({
    where: { curso: { nome: "Engenharia Informática" }, anoCurricular: { gte: 2 } },
    select: { anoCurricular: true },
  });
  if (faltam.length < CURRICULO.filter((a) => a.anoCurricular >= 2).flatMap((a) => a.disciplinas).length) {
    throw new Error(
      `Currículo dos anos 2-4 incompleto na BD (${faltam.length} cadeiras) — corre primeiro scripts/seed-teste-5-anos.ts.`,
    );
  }
}

/**
 * Garante que existe Turma+TurmaDisciplina para (anoCurricular, anoLetivo) antes de qualquer
 * rematrícula — idêntico ao que rolloverTurmas criaria, mas com o professor dono de cada
 * disciplina segundo o currículo canónico. Idempotente via upsert + check de disciplinas.
 */
export async function garantirTurmaAnoCurricular(prisma: PrismaClient, anoCurricular: number, anoLetivo: number): Promise<void> {
  const curso = await prisma.curso.findFirstOrThrow({ where: { nome: "Engenharia Informática" } });

  const turma = await prisma.turma.upsert({
    where: { cursoId_anoCurricular_periodo_anoLetivo: { cursoId: curso.id, anoCurricular, periodo: "MATUTINO", anoLetivo } },
    update: {},
    create: { cursoId: curso.id, anoCurricular, periodo: "MATUTINO", anoLetivo },
  });
  const jaTemDisciplinas = await prisma.turmaDisciplina.findFirst({ where: { turmaId: turma.id } });
  if (jaTemDisciplinas) return;

  const anoDef = CURRICULO.find((a) => a.anoCurricular === anoCurricular);
  if (!anoDef) throw new Error(`Ano curricular ${anoCurricular} não existe no currículo canónico.`);

  for (const disc of anoDef.disciplinas) {
    const cadeira = await prisma.cadeiraCurricular.findFirstOrThrow({
      where: { cursoId: curso.id, anoCurricular, semestre: disc.semestre, disciplina: { nome: disc.nome } },
    });
    const professor = await prisma.professor.findFirstOrThrow({ where: { email: disc.professorEmail } });

    // Unicidade real é (turmaId, cadeiraCurricularId) — createMany com skipDuplicates cobre
    // corridas repetidas sem colisão.
    await prisma.turmaDisciplina.createMany({
      data: [{ turmaId: turma.id, disciplinaId: cadeira.disciplinaId, cadeiraCurricularId: cadeira.id, professorId: professor.id, semestre: disc.semestre, sala: disc.sala }],
      skipDuplicates: true,
    });

    // Horário igual ao padrão do seed (SEG/QUA 1º sem, TER/QUI 2º sem) — sem isto o diagnóstico
    // dispara WARNING inscricao-ativa-tem-horario para toda a turma.
    const dias = disc.semestre === 1 ? ["SEGUNDA", "QUARTA"] : ["TERCA", "QUINTA"];
    const td = await prisma.turmaDisciplina.findFirstOrThrow({ where: { turmaId: turma.id, cadeiraCurricularId: cadeira.id } });
    const jaTemHorario = await prisma.horarioSlot.findFirst({ where: { turmaDisciplinaId: td.id } });
    if (!jaTemHorario) {
      await prisma.horarioSlot.createMany({
        data: dias.map((diaSemana) => ({ turmaDisciplinaId: td.id, diaSemana: diaSemana as "SEGUNDA" | "QUARTA" | "TERCA" | "QUINTA", horaInicio: "08:00", horaFim: "10:00", sala: disc.sala })),
      });
    }
  }
}

/**
 * Caso especial do Domingos (repetição): garante que a TurmaDisciplina da cadeira REPETIDA
 * (do ano origem) existe dentro da turma do ANO LETIVO alvo, apontando à CadeiraCurricular do
 * ano anterior — ver nota original: processarRematriculaAction procura a oferta por
 * (cadeiraCurricularId, anoLetivo alvo). A disciplina repetida passa a ser configurável pelo
 * cenário (antes era fixa "Bases de Dados").
 */
export async function garantirOfertaRepeticao(
  prisma: PrismaClient,
  nomeDisciplinaOrigem: string,
  anoCurricularOrigem: number,
  turmaAlvoId: string,
): Promise<void> {
  const curso = await prisma.curso.findFirstOrThrow({ where: { nome: "Engenharia Informática" } });
  const disciplina = await prisma.disciplina.findFirstOrThrow({ where: { nome: nomeDisciplinaOrigem } });
  const cadeiraOrigem = await prisma.cadeiraCurricular.findFirstOrThrow({
    where: { cursoId: curso.id, disciplinaId: disciplina.id, anoCurricular: anoCurricularOrigem },
  });
  const def = CURRICULO.flatMap((a) => a.disciplinas).find((d) => d.nome === nomeDisciplinaOrigem)!;
  const professor = await prisma.professor.findFirstOrThrow({ where: { email: def.professorEmail } });

  // Mesmo tratamento do original: se a turma alvo já tem uma TD desta disciplina (a oferta da
  // grade do próprio ano alvo), reaproveita-a apontando à cadeira de origem; senão cria.
  const existente = await prisma.turmaDisciplina.findFirst({ where: { turmaId: turmaAlvoId, disciplinaId: disciplina.id } });
  if (existente) {
    if (existente.cadeiraCurricularId === cadeiraOrigem.id) return;
    await prisma.turmaDisciplina.update({
      where: { id: existente.id },
      data: { cadeiraCurricularId: cadeiraOrigem.id, professorId: professor.id, sala: `${def.sala} (repetição)` },
    });
    return;
  }

  await prisma.turmaDisciplina.create({
    data: {
      turmaId: turmaAlvoId,
      disciplinaId: disciplina.id,
      cadeiraCurricularId: cadeiraOrigem.id,
      professorId: professor.id,
      semestre: cadeiraOrigem.semestre,
      sala: `${def.sala} (repetição)`,
    },
  });
}
