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
    prisma.propina.deleteMany(),
    prisma.configuracaoFinanceira.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.frequencia.deleteMany(),
    prisma.aula.deleteMany(),
    prisma.nota.deleteMany(),
    prisma.avaliacao.deleteMany(),
    prisma.horarioSlot.deleteMany(),
    prisma.matricula.deleteMany(),
    prisma.turmaDisciplina.deleteMany(),
    prisma.turma.deleteMany(),
    prisma.disciplina.deleteMany(),
    prisma.curso.deleteMany(),
    prisma.user.deleteMany(),
    prisma.aluno.deleteMany(),
    prisma.professor.deleteMany(),
  ]);

  console.log("A criar cursos e disciplinas...");
  const cursoEngInf = await prisma.curso.create({
    data: { nome: "Engenharia Informática", codigo: "ENG-INF", duracaoAnos: 4 },
  });
  const cursoGestao = await prisma.curso.create({
    data: { nome: "Gestão de Empresas", codigo: "GESTAO", duracaoAnos: 3 },
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
      { nome: "Eng. António Sousa", email: "antonio.sousa@ispc.ao", telefone: "923 111 222", especialidade: "Engenharia de Software" },
      { nome: "Eng. Rui Manuel Ferreira", email: "rui.ferreira@ispc.ao", telefone: "923 222 333", especialidade: "Bases de Dados" },
      { nome: "Prof. Joaquim Bandeira", email: "joaquim.bandeira@ispc.ao", telefone: "923 333 444", especialidade: "Redes e Infraestrutura" },
      { nome: "Dra. Fernanda Mucavele", email: "fernanda.mucavele@ispc.ao", telefone: "923 444 555", especialidade: "Gestão e Finanças" },
      { nome: "Dra. Isabel Chissano", email: "isabel.chissano@ispc.ao", telefone: "923 555 666", especialidade: "Marketing e Economia" },
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

  const turmaDisciplinas = [];
  for (const td of turmaDisciplinasData) {
    const created = await prisma.turmaDisciplina.create({
      data: {
        turmaId: td.turma.id,
        disciplinaId: td.disciplina.id,
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
      // demonstração (Secção 8) de forma determinística.
      const anoCurricular = index === 0 ? 1 : pick(curso === "Engenharia Informática" ? [1, 2, 3] : [1, 2]);
      return prisma.aluno.create({
        data: {
          numeroEstudante: `ISPC2026-${numero}`,
          nome: `${primeiro} ${ultimo}`,
          email: `${primeiro.toLowerCase().replace(/\s+/g, "")}.${ultimo.toLowerCase().replace(/\s+/g, "")}@aluno.ispc.ao`,
          telefone: `9${randomInt(10000000, 99999999)}`,
          dataNascimento: new Date(randomInt(1999, 2006), randomInt(0, 11), randomInt(1, 28)),
          genero: chance(0.5) ? "Feminino" : "Masculino",
          curso,
          anoIngresso: pick([2023, 2024, 2025]),
          anoCurricular,
          status: chance(0.9) ? "ATIVO" : "TRANCADO",
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

  const matriculas = [];
  for (const aluno of alunos) {
    const cursoId = aluno.curso === "Engenharia Informática" ? cursoEngInf.id : cursoGestao.id;
    const turmaId = turmasPorCursoAno.get(`${cursoId}:${aluno.anoCurricular}`);
    if (!turmaId) continue;
    const matricula = await prisma.matricula.create({ data: { alunoId: aluno.id, turmaId } });
    matriculas.push(matricula);
  }

  console.log("A criar avaliações, notas, aulas e frequência...");
  for (const td of turmaDisciplinas) {
    const avaliacoes = await Promise.all(
      [
        { nome: "1.ª Prova", tipo: "TESTE" as const, peso: 0.3, data: daysAgo(45), sala: td.salaExame },
        { nome: "2.ª Prova", tipo: "TESTE" as const, peso: 0.3, data: daysAgo(20), sala: td.salaExame },
        { nome: "Exame Final", tipo: "EXAME_FINAL" as const, peso: 0.4, data: daysAgo(-10), sala: td.salaExame },
      ].map((a) => prisma.avaliacao.create({ data: { ...a, turmaDisciplinaId: td.id } })),
    );

    const matriculasTurma = matriculas.filter((m) => m.turmaId === td.turmaId);
    for (const avaliacao of avaliacoes) {
      for (const matricula of matriculasTurma) {
        if (chance(0.8)) {
          await prisma.nota.create({
            data: { avaliacaoId: avaliacao.id, matriculaId: matricula.id, valor: randomInt(8, 19) },
          });
        }
      }
    }

    for (let semana = 6; semana >= 1; semana -= 1) {
      const aula = await prisma.aula.create({
        data: { turmaDisciplinaId: td.id, data: daysAgo(semana * 7) },
      });
      for (const matricula of matriculasTurma) {
        const presente = chance(0.9);
        await prisma.frequencia.create({
          data: {
            aulaId: aula.id,
            matriculaId: matricula.id,
            presente,
            justificada: presente ? null : chance(0.5),
          },
        });
      }
    }
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
    data: { name: profAntonio.nome, email: "professor@ispc.ao", passwordHash, role: "PROFESSOR", professorId: profAntonio.id },
  });
  await prisma.user.create({
    data: { name: primeiroAluno.nome, email: "aluno@ispc.ao", passwordHash, role: "ALUNO", alunoId: primeiroAluno.id },
  });

  console.log("A criar propinas (módulo financeiro)...");
  const VALOR_PROPINA_POR_CURSO: Record<string, number> = {
    "Engenharia Informática": 18000,
    "Gestão de Empresas": 15000,
  };

  await prisma.configuracaoFinanceira.create({
    data: { id: "config", bloqueioAtivo: true, toleranciaDias: 5, valorMensalPadrao: 15000 },
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
    const valorBase = VALOR_PROPINA_POR_CURSO[aluno.curso] ?? 15000;
    const valorDevido = valorBase + pick([0, 250, 500, 750]);

    // alunos[0] fica sempre "em dívida recente" para o fluxo de demonstração da Secção 8 ser reprodutível.
    const mesesPendentes = aluno.id === primeiroAluno.id ? 2 : perfilDivida();

    for (let i = 5; i >= 0; i -= 1) {
      const base = daysAgo(30 * i);
      const mesReferencia = new Date(base.getFullYear(), base.getMonth(), 1);
      const dataVencimento = new Date(base.getFullYear(), base.getMonth(), 8);
      const estaPendente = i < mesesPendentes;

      await prisma.propina.create({
        data: {
          matriculaId: matricula.id,
          alunoId: aluno.id,
          mesReferencia,
          valorDevido,
          valorPago: estaPendente ? 0 : valorDevido,
          status: estaPendente ? "PENDENTE" : "PAGO",
          dataVencimento,
          dataPagamento: estaPendente ? null : base,
          registadoPorId: estaPendente ? null : userSecretaria.id,
        },
      });
    }
  }

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
        entityType: "Propina",
        ipAddress: "197.221.16.40",
      },
    ],
  });

  console.log("Seed concluído com sucesso.");
  console.log(`Contas de demonstração (senha: ${DEMO_PASSWORD}):`);
  console.log("  admin@ispc.ao (ADMIN)");
  console.log("  secretaria@ispc.ao (SECRETARIA)");
  console.log("  professor@ispc.ao (PROFESSOR)");
  console.log("  aluno@ispc.ao (ALUNO)");
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
