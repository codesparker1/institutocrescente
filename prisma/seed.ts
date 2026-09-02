import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD = "Ispc@2026";

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(items: T[]): T {
  return items[randomInt(0, items.length - 1)];
}

function chance(probability: number): boolean {
  return Math.random() < probability;
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function telefoneAngola(): string {
  const numero = `9${randomInt(10000000, 99999999)}`;
  return `+244 ${numero.slice(0, 3)} ${numero.slice(3, 6)} ${numero.slice(6, 9)}`;
}

const ALUNO_NOMES: [string, string][] = [
  ["Marta", "Kiala"],
  ["João", "Manuel"],
  ["Beatriz", "Sacatucua"],
  ["Domingos", "Cavaco"],
  ["Isabel", "Neto"],
  ["Rafael", "Bumba"],
  ["Adriana", "Muanza"],
  ["Nelson", "Sapalo"],
  ["Carla", "Tchissola"],
  ["Ricardo", "Domingos"],
  ["Sandra", "Vieira Dias"],
  ["Emanuel", "Kiesse"],
  ["Paula", "Massano"],
  ["Hélder", "Zua"],
  ["Vanessa", "Capitango"],
  ["Miguel", "Sumbo"],
  ["Cátia", "Baptista"],
  ["Fábio", "Mbala"],
  ["Ana Paula", "Gaspar"],
  ["Wilson", "Bento"],
];

async function main() {
  console.log("A limpar dados existentes...");
  await prisma.$transaction([
    prisma.cobranca.deleteMany(),
    prisma.emolumento.deleteMany(),
    prisma.configuracaoFinanceira.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.frequencia.deleteMany(),
    prisma.aula.deleteMany(),
    prisma.nota.deleteMany(),
    prisma.avaliacao.deleteMany(),
    prisma.inscricaoCadeira.deleteMany(),
    prisma.horarioSlot.deleteMany(),
    prisma.matricula.deleteMany(),
    prisma.turmaDisciplina.deleteMany(),
    prisma.cadeiraCurricular.deleteMany(),
    prisma.turma.deleteMany(),
    prisma.disciplina.deleteMany(),
    prisma.curso.deleteMany(),
    prisma.user.deleteMany(),
    prisma.aluno.deleteMany(),
    prisma.professor.deleteMany(),
  ], { maxWait: 20000, timeout: 30000 });

  console.log("A criar cursos e disciplinas...");
  const cursoEngInf = await prisma.curso.create({
    data: { nome: "Engenharia Informática", codigo: "ENG-INF", duracaoAnos: 4 },
  });
  const cursoGestao = await prisma.curso.create({
    data: { nome: "Gestão de Empresas", codigo: "GESTAO", duracaoAnos: 3 },
  });

  // Preço por categoria × ano curricular, igual em todos os cursos (substituiu Curso.valorPropina).
  await prisma.precoPropina.createMany({
    data: (["NORMAL", "BOLSEIRO_INAGBE", "COMPARTICIPADA"] as const).flatMap((categoria) =>
      [1, 2, 3, 4].map((anoCurricular) => ({
        categoria,
        anoCurricular,
        valor: categoria === "NORMAL" ? 17000 : categoria === "COMPARTICIPADA" ? 10000 : 5000,
      })),
    ),
  });

  const [progI, progII, basesDados, redes] = await Promise.all(
    [
      { nome: "Programação I", codigo: "ENG-101", cargaHoraria: 60 },
      { nome: "Programação II", codigo: "ENG-102", cargaHoraria: 60 },
      { nome: "Bases de Dados", codigo: "ENG-201", cargaHoraria: 45 },
      { nome: "Redes de Computadores", codigo: "ENG-202", cargaHoraria: 45 },
    ].map((d) => prisma.disciplina.create({ data: { ...d, cursoId: cursoEngInf.id } })),
  );

  const [contabilidade, marketing] = await Promise.all(
    [
      { nome: "Contabilidade Geral", codigo: "GES-101", cargaHoraria: 45 },
      { nome: "Marketing", codigo: "GES-102", cargaHoraria: 45 },
    ].map((d) => prisma.disciplina.create({ data: { ...d, cursoId: cursoGestao.id } })),
  );

  await Promise.all(
    [
      { nome: "Economia", codigo: "GES-201", cargaHoraria: 45 },
      { nome: "Gestão Financeira", codigo: "GES-202", cargaHoraria: 45 },
    ].map((d) => prisma.disciplina.create({ data: { ...d, cursoId: cursoGestao.id } })),
  );

  console.log("A criar professores...");
  const [profAntonio, profRui, profJoaquim, profFernanda, profIsabel] = await Promise.all(
    [
      { nome: "Eng. António Sousa", email: "antonio.sousa@ispc.ao", telefone: "+244 923 111 222", especialidade: "Engenharia de Software" },
      { nome: "Eng. Rui Manuel Ferreira", email: "rui.ferreira@ispc.ao", telefone: "+244 923 222 333", especialidade: "Bases de Dados" },
      { nome: "Prof. Joaquim Bandeira", email: "joaquim.bandeira@ispc.ao", telefone: "+244 923 333 444", especialidade: "Redes e Infraestrutura" },
      { nome: "Dra. Fernanda Mucavele", email: "fernanda.mucavele@ispc.ao", telefone: "+244 923 444 555", especialidade: "Gestão e Finanças" },
      { nome: "Dra. Isabel Chissano", email: "isabel.chissano@ispc.ao", telefone: "+244 923 555 666", especialidade: "Marketing e Economia" },
    ].map((p) => prisma.professor.create({ data: p })),
  );

  console.log("A criar turmas (coortes: curso + ano + período)...");
  const turmaEngInf1 = await prisma.turma.create({
    data: { cursoId: cursoEngInf.id, anoCurricular: 1, periodo: "MATUTINO", anoLetivo: 2026 },
  });
  const turmaEngInf2 = await prisma.turma.create({
    data: { cursoId: cursoEngInf.id, anoCurricular: 2, periodo: "MATUTINO", anoLetivo: 2026 },
  });
  const turmaEngInf3 = await prisma.turma.create({
    data: { cursoId: cursoEngInf.id, anoCurricular: 3, periodo: "NOTURNO", anoLetivo: 2026 },
  });
  const turmaGestao1 = await prisma.turma.create({
    data: { cursoId: cursoGestao.id, anoCurricular: 1, periodo: "MATUTINO", anoLetivo: 2026 },
  });
  const turmaGestao2 = await prisma.turma.create({
    data: { cursoId: cursoGestao.id, anoCurricular: 2, periodo: "NOTURNO", anoLetivo: 2026 },
  });

  console.log("A atribuir disciplinas, professores e semestres às turmas...");
  const turmaDisciplinasData = [
    { turma: turmaEngInf1, disciplina: progI, professor: profAntonio, semestre: 1, sala: "Lab 1", slots: [
      { diaSemana: "SEGUNDA" as const, horaInicio: "08:00", horaFim: "10:00", sala: "Lab 1" },
      { diaSemana: "QUARTA" as const, horaInicio: "08:00", horaFim: "10:00", sala: "Lab 1" },
    ] },
    { turma: turmaEngInf2, disciplina: progII, professor: profAntonio, semestre: 1, sala: "Lab 1", slots: [
      { diaSemana: "TERCA" as const, horaInicio: "10:00", horaFim: "12:00", sala: "Lab 1" },
      { diaSemana: "QUINTA" as const, horaInicio: "10:00", horaFim: "12:00", sala: "Lab 1" },
    ] },
    { turma: turmaEngInf2, disciplina: basesDados, professor: profRui, semestre: 2, sala: "Lab 2", slots: [
      { diaSemana: "SEGUNDA" as const, horaInicio: "14:00", horaFim: "16:00", sala: "Lab 2" },
      { diaSemana: "QUARTA" as const, horaInicio: "14:00", horaFim: "16:00", sala: "Lab 2" },
    ] },
    { turma: turmaEngInf3, disciplina: redes, professor: profJoaquim, semestre: 1, sala: "Lab 3", slots: [
      { diaSemana: "SEXTA" as const, horaInicio: "18:00", horaFim: "22:00", sala: "Lab 3" },
    ] },
    { turma: turmaGestao1, disciplina: contabilidade, professor: profFernanda, semestre: 1, sala: "Sala 5", slots: [
      { diaSemana: "SEGUNDA" as const, horaInicio: "10:00", horaFim: "12:00", sala: "Sala 5" },
      { diaSemana: "QUARTA" as const, horaInicio: "10:00", horaFim: "12:00", sala: "Sala 5" },
    ] },
    { turma: turmaGestao2, disciplina: marketing, professor: profIsabel, semestre: 2, sala: "Sala 6", slots: [
      { diaSemana: "TERCA" as const, horaInicio: "18:00", horaFim: "20:00", sala: "Sala 6" },
      { diaSemana: "QUINTA" as const, horaInicio: "18:00", horaFim: "20:00", sala: "Sala 6" },
    ] },
  ];

  console.log("A definir o plano curricular (cadeira = curso × disciplina × ano × semestre)...");
  const cadeirasCurricularesPorChave = new Map<string, string>();
  for (const td of turmaDisciplinasData) {
    const chave = `${td.turma.cursoId}:${td.disciplina.id}:${td.turma.anoCurricular}:${td.semestre}`;
    if (cadeirasCurricularesPorChave.has(chave)) continue;
    const cadeira = await prisma.cadeiraCurricular.create({
      data: {
        cursoId: td.turma.cursoId,
        disciplinaId: td.disciplina.id,
        anoCurricular: td.turma.anoCurricular,
        semestre: td.semestre,
      },
    });
    cadeirasCurricularesPorChave.set(chave, cadeira.id);
  }

  const turmaDisciplinas = [];
  for (const td of turmaDisciplinasData) {
    const chave = `${td.turma.cursoId}:${td.disciplina.id}:${td.turma.anoCurricular}:${td.semestre}`;
    const created = await prisma.turmaDisciplina.create({
      data: {
        turmaId: td.turma.id,
        disciplinaId: td.disciplina.id,
        cadeiraCurricularId: cadeirasCurricularesPorChave.get(chave)!,
        professorId: td.professor.id,
        semestre: td.semestre,
        sala: td.sala,
      },
    });
    for (const slot of td.slots) {
      await prisma.horarioSlot.create({ data: { turmaDisciplinaId: created.id, ...slot } });
    }
    turmaDisciplinas.push({ ...created, salaExame: td.sala });
  }

  console.log("A criar alunos...");
  const alunos = await Promise.all(
    ALUNO_NOMES.map(([primeiro, ultimo], index) => {
      const curso = index % 2 === 0 ? "Engenharia Informática" : "Gestão de Empresas";
      const numero = String(index + 1).padStart(4, "0");
      // alunos[0] (usado no login de demo aluno@ispc.ao) fica fixado no 1º ano de Eng. Informática,
      // para cair sempre em turmaEngInf1 (que já tem avaliações seedadas) e reproduzir o fluxo de
      // demonstração (Secção 8) de forma determinística. alunos[2] fica fixado no 3º ano, para o
      // repetente de demonstração (turmaEngInf3) existir sempre, sem depender do pick() aleatório.
      // índices 4, 6, 8 (Eng. Informática, pares) também fixados no 1º ano — junto com o índice 0,
      // dão 4 alunos garantidos em turmaEngInf1/progI para os 4 estados de demonstração da Fase 6
      // (dispensado, admitido a exame aprovado, em recurso aprovado, reprovado). índice 10 igual,
      // fixado no 1º ano para o cenário de suspensão/reativação da Fase 8b (rematrícula).
      const anoCurricular =
        index === 0 || index === 4 || index === 6 || index === 8 || index === 10
          ? 1
          : index === 2
            ? 3
            : pick(curso === "Engenharia Informática" ? [1, 2, 3] : [1, 2]);
      return prisma.aluno.create({
        data: {
          numeroEstudante: `ISPC2026-${numero}`,
          nome: `${primeiro} ${ultimo}`,
          email: `${primeiro.toLowerCase().replace(/\s+/g, "")}.${ultimo.toLowerCase().replace(/\s+/g, "")}@aluno.ispc.ao`,
          telefone: telefoneAngola(),
          dataNascimento: new Date(randomInt(1999, 2006), randomInt(0, 11), randomInt(1, 28)),
          genero: chance(0.5) ? "Feminino" : "Masculino",
          curso,
          anoIngresso: pick([2023, 2024, 2025]),
          anoCurricular,
          // Índices usados em cenários determinísticos (0,2,4,6,8,10) ficam sempre ATIVO aqui —
          // o cenário de suspensão da Fase 8b (índice 10) aplica o TRANCADO explicitamente depois,
          // para não depender de uma coincidência de 10% e poder quebrar o login de demo (índice 0).
          status: [0, 2, 4, 6, 8, 10].includes(index) ? "ATIVO" : chance(0.9) ? "ATIVO" : "TRANCADO",
        },
      });
    }),
  );

  console.log("A matricular alunos nas suas turmas (curso + ano)...");
  const turmasPorCursoAno = new Map<string, string>([
    [`${cursoEngInf.id}:1`, turmaEngInf1.id],
    [`${cursoEngInf.id}:2`, turmaEngInf2.id],
    [`${cursoEngInf.id}:3`, turmaEngInf3.id],
    [`${cursoGestao.id}:1`, turmaGestao1.id],
    [`${cursoGestao.id}:2`, turmaGestao2.id],
  ]);

  // Um aluno TRANCADO (10% aleatório, acima) não pode nascer com Matricula/InscricaoCadeira
  // ativas — senão contradiz o próprio status desde o primeiro instante (mesmo invariante que
  // garantirSuspensaoAutomatica impõe em runtime, ver src/lib/diagnostico.ts).
  const statusPorAlunoId = new Map(alunos.map((a) => [a.id, a.status]));

  const matriculas = [];
  for (const aluno of alunos) {
    const cursoId = aluno.curso === "Engenharia Informática" ? cursoEngInf.id : cursoGestao.id;
    const turmaId = turmasPorCursoAno.get(`${cursoId}:${aluno.anoCurricular}`);
    if (!turmaId) continue;
    const matricula = await prisma.matricula.create({
      data: { alunoId: aluno.id, turmaId, status: aluno.status === "TRANCADO" ? "TRANCADA" : "ATIVA" },
    });
    matriculas.push(matricula);
  }

  console.log("A inscrever alunos nas cadeiras curriculares das suas turmas...");
  const inscricaoPorAlunoETurmaDisciplina = new Map<string, string>();
  for (const td of turmaDisciplinas) {
    const matriculasTurma = matriculas.filter((m) => m.turmaId === td.turmaId);
    for (const matricula of matriculasTurma) {
      const inscricao = await prisma.inscricaoCadeira.create({
        data: {
          alunoId: matricula.alunoId,
          cadeiraCurricularId: td.cadeiraCurricularId,
          turmaDisciplinaId: td.id,
          tentativa: 1,
          ativa: statusPorAlunoId.get(matricula.alunoId) !== "TRANCADO",
          // Regras de dispensa da CadeiraCurricular no momento da inscrição (defaults do seed).
          permiteDispensaAplicada: true,
          notaMinimaDispensaAplicada: 14,
        },
      });
      inscricaoPorAlunoETurmaDisciplina.set(`${matricula.alunoId}:${td.id}`, inscricao.id);
    }
  }

  console.log("A criar avaliações, notas, aulas e frequência...");
  for (const td of turmaDisciplinas) {
    const avaliacoes = await Promise.all(
      [
        { epoca: "P1" as const, data: daysAgo(45), sala: td.salaExame },
        { epoca: "P2" as const, data: daysAgo(20), sala: td.salaExame },
        { epoca: "EXAME" as const, data: daysAgo(-10), sala: td.salaExame },
      ].map((a) => prisma.avaliacao.create({ data: { ...a, turmaDisciplinaId: td.id } })),
    );

    const matriculasTurma = matriculas.filter((m) => m.turmaId === td.turmaId);
    for (const avaliacao of avaliacoes) {
      for (const matricula of matriculasTurma) {
        if (chance(0.8)) {
          const inscricaoId = inscricaoPorAlunoETurmaDisciplina.get(`${matricula.alunoId}:${td.id}`)!;
          await prisma.nota.create({
            data: { avaliacaoId: avaliacao.id, inscricaoCadeiraId: inscricaoId, valor: randomInt(8, 19) },
          });
        }
      }
    }

    for (let semana = 6; semana >= 1; semana -= 1) {
      const aula = await prisma.aula.create({
        data: { turmaDisciplinaId: td.id, data: daysAgo(semana * 7) },
      });
      for (const matricula of matriculasTurma) {
        const inscricaoId = inscricaoPorAlunoETurmaDisciplina.get(`${matricula.alunoId}:${td.id}`)!;
        const presente = chance(0.9);
        await prisma.frequencia.create({
          data: {
            aulaId: aula.id,
            inscricaoCadeiraId: inscricaoId,
            presente,
            justificada: presente ? null : chance(0.5),
          },
        });
      }
    }
  }

  console.log("A criar um repetente de demonstração (3º ano a repetir uma cadeira do 2º)...");
  const matriculaRepetente = matriculas.find((m) => m.turmaId === turmaEngInf3.id);
  const tdProgIIAno2 = turmaDisciplinas.find((td) => td.turmaId === turmaEngInf2.id && td.disciplinaId === progII.id);
  if (matriculaRepetente && tdProgIIAno2) {
    await prisma.inscricaoCadeira.create({
      data: {
        alunoId: matriculaRepetente.alunoId,
        cadeiraCurricularId: tdProgIIAno2.cadeiraCurricularId,
        turmaDisciplinaId: tdProgIIAno2.id,
        tentativa: 1,
        ativa: false,
        permiteDispensaAplicada: true,
        notaMinimaDispensaAplicada: 14,
      },
    });
    const inscricaoRepeticao = await prisma.inscricaoCadeira.create({
      data: {
        alunoId: matriculaRepetente.alunoId,
        cadeiraCurricularId: tdProgIIAno2.cadeiraCurricularId,
        turmaDisciplinaId: tdProgIIAno2.id,
        tentativa: 2,
        ativa: true,
        permiteDispensaAplicada: true,
        notaMinimaDispensaAplicada: 14,
      },
    });
    const p1AvaliacaoProgII = await prisma.avaliacao.findFirst({
      where: { turmaDisciplinaId: tdProgIIAno2.id, epoca: "P1" },
    });
    if (p1AvaliacaoProgII) {
      await prisma.nota.create({
        data: { avaliacaoId: p1AvaliacaoProgII.id, inscricaoCadeiraId: inscricaoRepeticao.id, valor: 9 },
      });
    }

    // As Aula de tdProgIIAno2 já foram criadas no loop anterior, com Frequencia só para quem já
    // estava inscrito nessa altura — sem isto, o repetente fica invisível na marcação de presença
    // das aulas já dadas (mesma classe de bug corrigida em backfillFrequenciasParaInscricoes).
    const aulasProgIIAno2 = await prisma.aula.findMany({ where: { turmaDisciplinaId: tdProgIIAno2.id }, select: { id: true } });
    if (aulasProgIIAno2.length > 0) {
      await prisma.frequencia.createMany({
        data: aulasProgIIAno2.map((aula) => ({ aulaId: aula.id, inscricaoCadeiraId: inscricaoRepeticao.id, presente: false })),
      });
    }
  }

  console.log("A criar 4 cenários de demonstração do motor de avaliação (progI, turmaEngInf1)...");
  const tdProgI = turmaDisciplinas.find((td) => td.turmaId === turmaEngInf1.id);
  if (tdProgI) {
    const [p1ProgI, p2ProgI, exameProgI] = await Promise.all(
      (["P1", "P2", "EXAME"] as const).map((epoca) => prisma.avaliacao.findFirstOrThrow({ where: { turmaDisciplinaId: tdProgI.id, epoca } })),
    );
    const [recursoProgI, especialProgI] = await Promise.all([
      prisma.avaliacao.create({
        data: { turmaDisciplinaId: tdProgI.id, epoca: "RECURSO", data: daysAgo(-24), sala: tdProgI.salaExame },
      }),
      prisma.avaliacao.create({
        data: { turmaDisciplinaId: tdProgI.id, epoca: "EXAME_ESPECIAL", data: daysAgo(-38), sala: tdProgI.salaExame },
      }),
    ]);

    const inscricaoDe = (alunoId: string) => inscricaoPorAlunoETurmaDisciplina.get(`${alunoId}:${tdProgI.id}`);
    const alunoPorIndice = (indice: number) => alunos[indice];

    // Marta (índice 0, aluno@ispc.ao): dispensado — média (16+15)/2=15.5 >= 14.
    const inscricaoDispensado = inscricaoDe(alunoPorIndice(0).id);
    // Isabel (índice 4): admitido a exame, aprovado — (8+8+15)/3=10.33.
    const inscricaoAprovadoExame = inscricaoDe(alunoPorIndice(4).id);
    // Adriana (índice 6): reprovada no exame, aprovada no recurso (conta isolado) — recurso=14.
    const inscricaoAprovadoRecurso = inscricaoDe(alunoPorIndice(6).id);
    // Carla (índice 8): reprovada em todas as épocas até ao exame especial.
    const inscricaoReprovado = inscricaoDe(alunoPorIndice(8).id);

    const notasDemo: { avaliacaoId: string; inscricaoCadeiraId: string; valor: number }[] = [];
    if (inscricaoDispensado) {
      notasDemo.push({ avaliacaoId: p1ProgI.id, inscricaoCadeiraId: inscricaoDispensado, valor: 16 });
      notasDemo.push({ avaliacaoId: p2ProgI.id, inscricaoCadeiraId: inscricaoDispensado, valor: 15 });
    }
    if (inscricaoAprovadoExame) {
      notasDemo.push({ avaliacaoId: p1ProgI.id, inscricaoCadeiraId: inscricaoAprovadoExame, valor: 8 });
      notasDemo.push({ avaliacaoId: p2ProgI.id, inscricaoCadeiraId: inscricaoAprovadoExame, valor: 8 });
      notasDemo.push({ avaliacaoId: exameProgI.id, inscricaoCadeiraId: inscricaoAprovadoExame, valor: 15 });
    }
    if (inscricaoAprovadoRecurso) {
      notasDemo.push({ avaliacaoId: p1ProgI.id, inscricaoCadeiraId: inscricaoAprovadoRecurso, valor: 5 });
      notasDemo.push({ avaliacaoId: p2ProgI.id, inscricaoCadeiraId: inscricaoAprovadoRecurso, valor: 5 });
      notasDemo.push({ avaliacaoId: exameProgI.id, inscricaoCadeiraId: inscricaoAprovadoRecurso, valor: 5 });
      notasDemo.push({ avaliacaoId: recursoProgI.id, inscricaoCadeiraId: inscricaoAprovadoRecurso, valor: 14 });
    }
    if (inscricaoReprovado) {
      notasDemo.push({ avaliacaoId: p1ProgI.id, inscricaoCadeiraId: inscricaoReprovado, valor: 3 });
      notasDemo.push({ avaliacaoId: p2ProgI.id, inscricaoCadeiraId: inscricaoReprovado, valor: 3 });
      notasDemo.push({ avaliacaoId: exameProgI.id, inscricaoCadeiraId: inscricaoReprovado, valor: 3 });
      notasDemo.push({ avaliacaoId: recursoProgI.id, inscricaoCadeiraId: inscricaoReprovado, valor: 4 });
      notasDemo.push({ avaliacaoId: especialProgI.id, inscricaoCadeiraId: inscricaoReprovado, valor: 5 });
    }
    for (const nota of notasDemo) {
      await prisma.nota.upsert({
        where: { avaliacaoId_inscricaoCadeiraId: { avaliacaoId: nota.avaliacaoId, inscricaoCadeiraId: nota.inscricaoCadeiraId } },
        create: nota,
        update: { valor: nota.valor },
      });
    }
  }

  console.log("A criar configuração académica e turmas de 2027 (rematrícula, Fase 8b)...");
  // limiteReprovacoes=0 é só para os cenários de demonstração ficarem claros com os alunos já
  // seedados (Marta/Isabel/Adriana com 0 reprovações avançam; Carla com 1 fica retida) — o DAAC
  // pode alterar isto a qualquer momento em Admin > Configuração Académica.
  await prisma.configuracaoAcademica.upsert({
    where: { id: "config" },
    update: {},
    create: {
      id: "config",
      limiteReprovacoes: 0,
      regraRetencao: "SO_REPROVADAS",
      matriculaInicio: daysAgo(15),
      matriculaFim: daysAgo(-45),
    },
  });

  const cadeiraProgI = cadeirasCurricularesPorChave.get(`${cursoEngInf.id}:${progI.id}:1:1`)!;
  const cadeiraProgII = cadeirasCurricularesPorChave.get(`${cursoEngInf.id}:${progII.id}:2:1`)!;

  const turmaEngInf1_2027 = await prisma.turma.create({
    data: { cursoId: cursoEngInf.id, anoCurricular: 1, periodo: "MATUTINO", anoLetivo: 2027 },
  });
  const turmaEngInf2_2027 = await prisma.turma.create({
    data: { cursoId: cursoEngInf.id, anoCurricular: 2, periodo: "MATUTINO", anoLetivo: 2027 },
  });
  await prisma.turmaDisciplina.create({
    data: {
      turmaId: turmaEngInf1_2027.id,
      disciplinaId: progI.id,
      cadeiraCurricularId: cadeiraProgI,
      professorId: profAntonio.id,
      semestre: 1,
      sala: "Lab 1",
    },
  });
  await prisma.turmaDisciplina.create({
    data: {
      turmaId: turmaEngInf2_2027.id,
      disciplinaId: progII.id,
      cadeiraCurricularId: cadeiraProgII,
      professorId: profAntonio.id,
      semestre: 1,
      sala: "Lab 1",
    },
  });
  // Deliberadamente sem sincronizarInscricoesTurma aqui — estas turmas ficam vazias de propósito,
  // para a Secretaria testar "Processar Rematrícula" ao vivo em alunos/[id] durante a semana de
  // testes (Marta/Isabel/Adriana avançam para cá; Carla fica retida em turmaEngInf1_2027).

  console.log("A suspender um aluno de demonstração que não rematriculou (TRANCADO)...");
  const alunoSuspenso = alunos[10]; // Sandra Vieira Dias — par, Eng. Informática, 1º ano (mesma turma de Marta)
  const matriculaSuspensa = matriculas.find((m) => m.alunoId === alunoSuspenso.id);
  if (matriculaSuspensa) {
    await prisma.$transaction([
      prisma.aluno.update({ where: { id: alunoSuspenso.id }, data: { status: "TRANCADO" } }),
      prisma.matricula.update({ where: { id: matriculaSuspensa.id }, data: { status: "TRANCADA" } }),
      prisma.inscricaoCadeira.updateMany({ where: { alunoId: alunoSuspenso.id, ativa: true }, data: { ativa: false } }),
    ]);
  }

  console.log("A criar utilizadores de demonstração...");
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const primeiroAluno = alunos[0];

  await prisma.user.create({
    data: { name: "Administrador ISPC", email: "admin@ispc.ao", passwordHash, role: "ADMIN" },
  });
  const userSecretaria = await prisma.user.create({
    data: { name: "Secretaria ISPC", email: "secretaria@ispc.ao", passwordHash, role: "SECRETARIA" },
  });
  await prisma.user.create({
    data: { name: "DAAC ISPC", email: "daac@ispc.ao", passwordHash, role: "DAAC" },
  });
  // Atalho de demo — mesmo professor de profAntonio, sob um email mais fácil de digitar.
  await prisma.user.create({
    data: { name: profAntonio.nome, email: "professor@ispc.ao", passwordHash, role: "PROFESSOR", professorId: profAntonio.id },
  });
  // Atalho de demo — mesmo aluno do primeiroAluno, sob um email mais fácil de digitar.
  await prisma.user.create({
    data: { name: primeiroAluno.nome, email: "aluno@ispc.ao", passwordHash, role: "ALUNO", alunoId: primeiroAluno.id },
  });

  console.log("A criar conta de login para todos os professores e alunos (consistente com o sistema atual)...");
  const outrosProfessores = [profRui, profJoaquim, profFernanda, profIsabel];
  await Promise.all(
    outrosProfessores.map((professor) =>
      prisma.user.create({
        data: { name: professor.nome, email: professor.email, passwordHash, role: "PROFESSOR", professorId: professor.id },
      }),
    ),
  );

  const outrosAlunos = alunos.slice(1);
  await Promise.all(
    outrosAlunos.map((aluno) =>
      prisma.user.create({
        data: { name: aluno.nome, email: aluno.email, passwordHash, role: "ALUNO", alunoId: aluno.id },
      }),
    ),
  );

  console.log("A criar cobranças (módulo financeiro)...");

  await prisma.configuracaoFinanceira.create({
    data: { id: "config", bloqueioAtivo: true, toleranciaDias: 0, diaVencimento: 10, valorMulta: 5000 },
  });

  // Perfil de dívida: quantos dos últimos 6 meses (a contar do mais recente) ficam PENDENTE.
  // Nunca deixar apenas 1 mês pendente: o mês corrente ainda pode estar dentro da tolerância,
  // por isso qualquer aluno "em dívida" tem sempre pelo menos o mês anterior também pendente,
  // que fica seguramente vencido além da tolerância.
  function perfilDivida(): number {
    if (chance(0.5)) return 0; // regularizado
    if (chance(0.4)) return 2; // em dívida recente
    if (chance(0.6)) return pick([3, 4]); // em dívida moderada
    return pick([5, 6]); // em dívida crónica
  }

  for (const matricula of matriculas) {
    const aluno = alunos.find((a) => a.id === matricula.alunoId)!;
    const valorBase = 17000; // preço NORMAL fixo (todo aluno seedado aqui é categoria NORMAL)
    const valorDevido = valorBase + pick([0, 250, 500, 750]);

    // alunos[0] fica sempre "em dívida recente" para o fluxo de demonstração da Secção 8 ser reprodutível.
    const mesesPendentes = aluno.id === primeiroAluno.id ? 2 : perfilDivida();

    for (let i = 5; i >= 0; i -= 1) {
      const base = daysAgo(30 * i);
      const mesReferencia = new Date(base.getFullYear(), base.getMonth(), 1);
      const dataVencimento = new Date(base.getFullYear(), base.getMonth(), 8);
      const estaPendente = i < mesesPendentes;

      const propina = await prisma.cobranca.create({
        data: {
          matriculaId: matricula.id,
          alunoId: aluno.id,
          tipo: "PROPINA",
          mesReferencia,
          valorDevido,
          valorPago: estaPendente ? 0 : valorDevido,
          status: estaPendente ? "PENDENTE" : "PAGO",
          dataVencimento,
          dataPagamento: estaPendente ? null : base,
          registadoPorId: estaPendente ? null : userSecretaria.id,
        },
      });

      // Multa de demonstração — só para a propina mais antiga em dívida do aluno "em dívida crónica" (Secção 8).
      if (estaPendente && i === 5 && mesesPendentes >= 5) {
        await prisma.cobranca.create({
          data: {
            matriculaId: matricula.id,
            alunoId: aluno.id,
            tipo: "MULTA",
            mesReferencia,
            valorDevido: 5000,
            status: "PENDENTE",
            dataVencimento: propina.dataVencimento,
          },
        });
      }
    }
  }

  console.log("A criar catálogo de emolumentos...");
  await prisma.emolumento.createMany({
    data: [
      { nome: "Declaração de matrícula", descricao: "Comprova a matrícula no ano letivo corrente", valor: 3000 },
      { nome: "Certidão de notas", descricao: "Histórico de notas até à data do pedido", valor: 5000 },
      { nome: "Cartão de estudante (2ª via)", descricao: "Reemissão por perda ou dano", valor: 4000 },
    ],
  });

  console.log("A criar registos de auditoria iniciais...");
  await prisma.auditLog.createMany({
    data: [
      {
        userName: "Administrador ISPC",
        userRole: "ADMIN",
        action: "Iniciou sessão",
        entityType: "User",
        ipAddress: "197.221.16.12",
      },
      {
        userName: profAntonio.nome,
        userRole: "PROFESSOR",
        action: "Lançou nota em Programação I",
        entityType: "Nota",
        ipAddress: "197.221.30.88",
      },
      {
        userName: "Secretaria ISPC",
        userRole: "SECRETARIA",
        action: `Matriculou ${primeiroAluno.nome} numa nova turma`,
        entityType: "Matricula",
        ipAddress: "197.221.16.40",
      },
      {
        userName: "Secretaria ISPC",
        userRole: "SECRETARIA",
        action: `Confirmou o pagamento de propina de um aluno`,
        entityType: "Cobranca",
        ipAddress: "197.221.16.40",
      },
    ],
  });

  console.log("Seed concluído com sucesso.");
  console.log(`Todas as contas usam a mesma senha: ${DEMO_PASSWORD}`);
  console.log("Atalhos de demonstração:");
  console.log("  admin@ispc.ao (ADMIN)");
  console.log("  secretaria@ispc.ao (SECRETARIA)");
  console.log("  daac@ispc.ao (DAAC)");
  console.log("  professor@ispc.ao (PROFESSOR, = " + profAntonio.email + ")");
  console.log("  aluno@ispc.ao (ALUNO, = " + primeiroAluno.email + ")");
  console.log(`Todos os ${outrosProfessores.length + 1} professores e ${alunos.length} alunos têm conta de login própria (email real + senha acima).`);
  console.log(`Aluno em dívida para demo: ${primeiroAluno.numeroEstudante} (${primeiroAluno.nome})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
