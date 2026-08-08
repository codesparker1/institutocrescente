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
    prisma.auditLog.deleteMany(),
    prisma.frequencia.deleteMany(),
    prisma.aula.deleteMany(),
    prisma.nota.deleteMany(),
    prisma.avaliacao.deleteMany(),
    prisma.matricula.deleteMany(),
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

  const disciplinasEngInf = await Promise.all(
    [
      { nome: "Programação I", codigo: "ENG-101", cargaHoraria: 60 },
      { nome: "Programação II", codigo: "ENG-102", cargaHoraria: 60 },
      { nome: "Bases de Dados", codigo: "ENG-201", cargaHoraria: 45 },
      { nome: "Redes de Computadores", codigo: "ENG-202", cargaHoraria: 45 },
    ].map((d) => prisma.disciplina.create({ data: { ...d, cursoId: cursoEngInf.id } })),
  );

  const disciplinasGestao = await Promise.all(
    [
      { nome: "Contabilidade Geral", codigo: "GES-101", cargaHoraria: 45 },
      { nome: "Marketing", codigo: "GES-102", cargaHoraria: 45 },
      { nome: "Economia", codigo: "GES-201", cargaHoraria: 45 },
      { nome: "Gestão Financeira", codigo: "GES-202", cargaHoraria: 45 },
    ].map((d) => prisma.disciplina.create({ data: { ...d, cursoId: cursoGestao.id } })),
  );

  console.log("A criar professores...");
  const professores = await Promise.all(
    [
      { nome: "Eng. António Sousa", email: "antonio.sousa@ispc.ao", telefone: "923 111 222", especialidade: "Engenharia de Software" },
      { nome: "Eng. Rui Manuel Ferreira", email: "rui.ferreira@ispc.ao", telefone: "923 222 333", especialidade: "Bases de Dados" },
      { nome: "Prof. Joaquim Bandeira", email: "joaquim.bandeira@ispc.ao", telefone: "923 333 444", especialidade: "Redes e Infraestrutura" },
      { nome: "Dra. Fernanda Mucavele", email: "fernanda.mucavele@ispc.ao", telefone: "923 444 555", especialidade: "Gestão e Finanças" },
      { nome: "Dra. Isabel Chissano", email: "isabel.chissano@ispc.ao", telefone: "923 555 666", especialidade: "Marketing e Economia" },
    ].map((p) => prisma.professor.create({ data: p })),
  );
  const [profAntonio, profRui, profJoaquim, profFernanda, profIsabel] = professores;

  console.log("A criar turmas...");
  const turmasData = [
    {
      nome: "Programação I - 1º Ano",
      disciplina: disciplinasEngInf[0],
      professor: profAntonio,
      sala: "Lab 1",
      horario: "Seg/Qua 08h-10h",
      anoCurricular: 1,
      periodo: "MATUTINO" as const,
      slots: [
        { diaSemana: "SEGUNDA" as const, horaInicio: "08:00", horaFim: "10:00", sala: "Lab 1" },
        { diaSemana: "QUARTA" as const, horaInicio: "08:00", horaFim: "10:00", sala: "Lab 1" },
      ],
    },
    {
      nome: "Programação II - 2º Ano",
      disciplina: disciplinasEngInf[1],
      professor: profAntonio,
      sala: "Lab 1",
      horario: "Ter/Qui 10h-12h",
      anoCurricular: 2,
      periodo: "MATUTINO" as const,
      slots: [
        { diaSemana: "TERCA" as const, horaInicio: "10:00", horaFim: "12:00", sala: "Lab 1" },
        { diaSemana: "QUINTA" as const, horaInicio: "10:00", horaFim: "12:00", sala: "Lab 1" },
      ],
    },
    {
      nome: "Bases de Dados - 2º Ano",
      disciplina: disciplinasEngInf[2],
      professor: profRui,
      sala: "Lab 2",
      horario: "Seg/Qua 14h-16h",
      anoCurricular: 2,
      periodo: "VESPERTINO" as const,
      slots: [
        { diaSemana: "SEGUNDA" as const, horaInicio: "14:00", horaFim: "16:00", sala: "Lab 2" },
        { diaSemana: "QUARTA" as const, horaInicio: "14:00", horaFim: "16:00", sala: "Lab 2" },
      ],
    },
    {
      nome: "Redes de Computadores - 3º Ano",
      disciplina: disciplinasEngInf[3],
      professor: profJoaquim,
      sala: "Lab 3",
      horario: "Sex 18h-22h",
      anoCurricular: 3,
      periodo: "NOTURNO" as const,
      slots: [{ diaSemana: "SEXTA" as const, horaInicio: "18:00", horaFim: "22:00", sala: "Lab 3" }],
    },
    {
      nome: "Contabilidade Geral - 1º Ano",
      disciplina: disciplinasGestao[0],
      professor: profFernanda,
      sala: "Sala 5",
      horario: "Seg/Qua 10h-12h",
      anoCurricular: 1,
      periodo: "MATUTINO" as const,
      slots: [
        { diaSemana: "SEGUNDA" as const, horaInicio: "10:00", horaFim: "12:00", sala: "Sala 5" },
        { diaSemana: "QUARTA" as const, horaInicio: "10:00", horaFim: "12:00", sala: "Sala 5" },
      ],
    },
    {
      nome: "Marketing - 2º Ano",
      disciplina: disciplinasGestao[1],
      professor: profIsabel,
      sala: "Sala 6",
      horario: "Ter/Qui 18h-20h",
      anoCurricular: 2,
      periodo: "NOTURNO" as const,
      slots: [
        { diaSemana: "TERCA" as const, horaInicio: "18:00", horaFim: "20:00", sala: "Sala 6" },
        { diaSemana: "QUINTA" as const, horaInicio: "18:00", horaFim: "20:00", sala: "Sala 6" },
      ],
    },
  ];

  const turmas = await Promise.all(
    turmasData.map((t) =>
      prisma.turma.create({
        data: {
          nome: t.nome,
          disciplinaId: t.disciplina.id,
          professorId: t.professor.id,
          anoLetivo: 2026,
          semestre: 1,
          anoCurricular: t.anoCurricular,
          periodo: t.periodo,
          sala: t.sala,
          horario: t.horario,
        },
      }),
    ),
  );

  console.log("A criar horário semanal das turmas...");
  for (let i = 0; i < turmas.length; i += 1) {
    for (const slot of turmasData[i].slots) {
      await prisma.horarioSlot.create({ data: { turmaId: turmas[i].id, ...slot } });
    }
  }

  console.log("A criar alunos...");
  const alunos = await Promise.all(
    ALUNO_NOMES.map(([primeiro, ultimo], index) => {
      const curso = index % 2 === 0 ? "Engenharia Informática" : "Gestão de Empresas";
      const numero = String(index + 1).padStart(4, "0");
      const anoCurricular = pick(curso === "Engenharia Informática" ? [1, 2, 3] : [1, 2]);
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

  console.log("A matricular alunos nas turmas...");
  const turmasEngInf = turmas.slice(0, 4);
  const turmasGestao = turmas.slice(4, 6);
  const turmaAnoCurricular = new Map(turmas.map((t, i) => [t.id, turmasData[i].anoCurricular]));

  const matriculas: { id: string; turmaId: string; alunoId: string }[] = [];
  for (const aluno of alunos) {
    const cursoPool = aluno.curso === "Engenharia Informática" ? turmasEngInf : turmasGestao;
    const pool = cursoPool.filter((t) => turmaAnoCurricular.get(t.id) === aluno.anoCurricular);
    const poolFinal = pool.length > 0 ? pool : cursoPool;
    const quantidade = Math.min(poolFinal.length, randomInt(1, poolFinal.length));
    const escolhidas = [...poolFinal].sort(() => Math.random() - 0.5).slice(0, quantidade);
    for (const turma of escolhidas) {
      const matricula = await prisma.matricula.create({
        data: { alunoId: aluno.id, turmaId: turma.id },
      });
      matriculas.push(matricula);
    }
  }

  console.log("A criar avaliações e notas...");
  for (let i = 0; i < turmas.length; i += 1) {
    const turma = turmas[i];
    const salaExame = turmasData[i].sala;
    const avaliacoes = await Promise.all(
      [
        { nome: "Teste 1", tipo: "TESTE" as const, peso: 0.3, data: daysAgo(45), sala: salaExame },
        { nome: "Teste 2", tipo: "TESTE" as const, peso: 0.3, data: daysAgo(20), sala: salaExame },
        { nome: "Exame Final", tipo: "EXAME_FINAL" as const, peso: 0.4, data: daysAgo(-10), sala: salaExame },
      ].map((a) => prisma.avaliacao.create({ data: { ...a, turmaId: turma.id } })),
    );

    const matriculasTurma = matriculas.filter((m) => m.turmaId === turma.id);
    for (const avaliacao of avaliacoes) {
      for (const matricula of matriculasTurma) {
        if (chance(0.8)) {
          await prisma.nota.create({
            data: {
              avaliacaoId: avaliacao.id,
              matriculaId: matricula.id,
              valor: randomInt(8, 19),
            },
          });
        }
      }
    }

    console.log(`A criar aulas e frequência para ${turma.nome}...`);
    for (let semana = 6; semana >= 1; semana -= 1) {
      const aula = await prisma.aula.create({
        data: { turmaId: turma.id, data: daysAgo(semana * 7) },
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

  await prisma.user.createMany({
    data: [
      { name: "Administrador ISPC", email: "admin@ispc.ao", passwordHash, role: "ADMIN" },
      { name: "Secretaria ISPC", email: "secretaria@ispc.ao", passwordHash, role: "SECRETARIA" },
      { name: profAntonio.nome, email: "professor@ispc.ao", passwordHash, role: "PROFESSOR", professorId: profAntonio.id },
      { name: primeiroAluno.nome, email: "aluno@ispc.ao", passwordHash, role: "ALUNO", alunoId: primeiroAluno.id },
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
        action: "Lançou nota em Programação I - Turma A",
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
    ],
  });

  console.log("Seed concluído com sucesso.");
  console.log(`Contas de demonstração (senha: ${DEMO_PASSWORD}):`);
  console.log("  admin@ispc.ao (ADMIN)");
  console.log("  secretaria@ispc.ao (SECRETARIA)");
  console.log("  professor@ispc.ao (PROFESSOR)");
  console.log("  aluno@ispc.ao (ALUNO)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
