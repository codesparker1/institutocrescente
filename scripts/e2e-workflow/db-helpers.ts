/**
 * Direct-Prisma helpers for the e2e workflow test.
 *
 * These exist only because two steps have no reachable path through the app's UI:
 * - Matriculating an aluno into a turma (no Server Action / page does this anywhere).
 * - Creating a fresh Propina row for a given month (only ever done by prisma/seed.ts).
 * Everything else in run.mjs goes through real HTTP/Playwright form submissions.
 *
 * IMPORTANT: point this at the local stress DB only, same as scripts/stress/*.
 * DATABASE_URL is read from .env.local (see project_stress_testing_setup memory).
 */
import "dotenv/config";
import dotenv from "dotenv";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// dotenv/config only loads .env; Next.js loads .env.local for us normally, but this
// standalone script needs the same override the dev server uses (local stress DB).
dotenv.config({ path: ".env.local", override: true });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

export async function getSeededContext() {
  const turma = await prisma.turma.findFirst({
    where: { curso: { nome: "Engenharia Informática" }, anoCurricular: 1 },
    include: { curso: true },
  });
  if (!turma) throw new Error("Turma de Eng. Informática (1º ano) não encontrada — corre o seed primeiro.");

  const turmaDisciplina = await prisma.turmaDisciplina.findFirst({
    where: { turmaId: turma.id, disciplina: { nome: { contains: "Programação" } } },
    include: { disciplina: true, professor: true },
  });
  if (!turmaDisciplina) throw new Error("TurmaDisciplina de Programação I não encontrada.");

  const avaliacao = await prisma.avaliacao.findFirst({
    where: { turmaDisciplinaId: turmaDisciplina.id, epoca: "P1" },
  });
  if (!avaliacao) throw new Error("Avaliação P1 não encontrada.");

  const alunoEmDivida = await prisma.aluno.findUnique({ where: { email: "aluno@ispc.ao" } });
  if (!alunoEmDivida) throw new Error("aluno@ispc.ao (seed) não encontrado.");

  const matriculaEmDivida = await prisma.matricula.findFirst({
    where: { alunoId: alunoEmDivida.id, turmaId: turma.id },
  });
  if (!matriculaEmDivida) throw new Error("Matrícula do aluno@ispc.ao na turma seedada não encontrada.");

  const config = await prisma.configuracaoFinanceira.upsert({
    where: { id: "config" },
    update: {},
    create: { id: "config" },
  });

  const precoPropina = await prisma.precoPropina.findUnique({
    where: { categoria_anoCurricular: { categoria: alunoEmDivida.categoria, anoCurricular: turma.anoCurricular } },
  });
  if (!precoPropina) throw new Error(`Sem PrecoPropina para ${alunoEmDivida.categoria}/${turma.anoCurricular}º Ano — corre o seed primeiro.`);

  return {
    turma,
    turmaDisciplina,
    avaliacao,
    alunoEmDivida,
    matriculaEmDivida,
    valorPropina: Number(precoPropina.valor),
    bloqueioAtivo: config.bloqueioAtivo,
  };
}

export async function matricularNovoAlunoComPropinaPendente(email: string, turmaId: string) {
  const aluno = await prisma.aluno.findUnique({ where: { email } });
  if (!aluno) throw new Error(`Aluno recém-criado (${email}) não encontrado — a criação via UI falhou?`);

  const matricula = await prisma.matricula.create({
    data: { alunoId: aluno.id, turmaId, status: "ATIVA" },
  });

  const turma = await prisma.turma.findUniqueOrThrow({ where: { id: turmaId } });
  const hoje = new Date();
  const mesReferencia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const dataVencimento = new Date(hoje.getFullYear(), hoje.getMonth(), 10);

  const precoPropina = await prisma.precoPropina.findUniqueOrThrow({
    where: { categoria_anoCurricular: { categoria: aluno.categoria, anoCurricular: turma.anoCurricular } },
  });

  const propina = await prisma.cobranca.create({
    data: {
      matriculaId: matricula.id,
      alunoId: aluno.id,
      tipo: "PROPINA",
      mesReferencia,
      valorDevido: precoPropina.valor,
      dataVencimento,
      status: "PENDENTE",
    },
  });

  return { aluno, matricula, propina };
}

export async function disconnect() {
  await prisma.$disconnect();
}
