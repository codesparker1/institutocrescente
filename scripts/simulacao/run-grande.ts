/**
 * Corrida concorrente real, contra um build de produção (`next build && next start`, nunca
 * `next dev` — ver o comentário em run-pequeno.ts sobre compilação Turbopack lenta no primeiro
 * hit). Reaproveita os mesmos agentes por papel de scripts/simulacao/agentes/*.ts, só que em
 * paralelo (Promise.all, um BrowserContext por agente — nunca partilhar Page/context entre logins
 * diferentes, senão as sessões colidem).
 *
 * Ao contrário de run-pequeno.ts (1 de cada papel, para validar seletores), o objetivo aqui é
 * volume: apanhar corridas de dados e degradação que só aparecem sob concorrência real, contra a
 * seed grande (scripts/seed-grande/run.ts — 1000 alunos, 100 professores).
 *
 * Usage: npx tsx scripts/simulacao/run-grande.ts [--url http://localhost:3000]
 *   [--alunos 10] [--professores 3] [--secretarias 1] [--admins 1] [--daac 0]
 */
import "dotenv/config";
import dotenv from "dotenv";
import { chromium } from "playwright";
import path from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { garantirNaoENeon } from "../lib/guardarNeon";
import { avancarRelogio } from "./relogio";
import { escreverRelatorioAnomalias } from "./anomalias";
import { visitarComoAluno } from "./agentes/aluno";
import { agirComoProfessor } from "./agentes/professor";
import { visitarComoSecretaria } from "./agentes/secretaria";
import { visitarComoAdmin } from "./agentes/admin";
import { visitarComoDaac } from "./agentes/daac";
import { getContextoSimulacao, disconnect, type CredencialAgente } from "./db-helpers";
import { diagnosticarTodos, type AlunoParaDiagnostico, type Violacao } from "../../src/lib/diagnostico";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { Browser, BrowserContext } from "playwright";

dotenv.config({ path: ".env.local", override: true });
garantirNaoENeon();

interface Args {
  url: string;
  alunos: number;
  professores: number;
  secretarias: number;
  admins: number;
  daac: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { url: "http://localhost:3000", alunos: 10, professores: 3, secretarias: 1, admins: 1, daac: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    const chave = argv[i];
    const valor = argv[i + 1];
    if (chave === "--url") args.url = valor;
    else if (chave === "--alunos") args.alunos = Number(valor);
    else if (chave === "--professores") args.professores = Number(valor);
    else if (chave === "--secretarias") args.secretarias = Number(valor);
    else if (chave === "--admins") args.admins = Number(valor);
    else if (chave === "--daac") args.daac = Number(valor);
  }
  return args;
}

interface ResultadoAgente {
  papel: string;
  ok: boolean;
  duracaoMs: number;
  erro: string | null;
}

async function correrAgente<T>(browser: Browser, papel: string, tarefa: (agenteContexto: BrowserContext) => Promise<T>): Promise<ResultadoAgente & { valor: T | null }> {
  const inicio = Date.now();
  const contexto = await browser.newContext();
  try {
    const valor = await tarefa(contexto);
    return { papel, ok: true, duracaoMs: Date.now() - inicio, erro: null, valor };
  } catch (error) {
    return { papel, ok: false, duracaoMs: Date.now() - inicio, erro: error instanceof Error ? error.message : String(error), valor: null };
  } finally {
    await contexto.close();
  }
}

async function correrDiagnostico(): Promise<Violacao[]> {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  const alunos = await prisma.aluno.findMany({
    select: {
      id: true,
      nome: true,
      status: true,
      matriculas: { select: { id: true, status: true, turma: { select: { anoLetivo: true } } } },
      inscricoes: {
        select: {
          id: true,
          ativa: true,
          cadeiraCurricularId: true,
          cadeiraCurricular: { select: { disciplina: { select: { nome: true } } } },
          turmaDisciplina: { select: { turma: { select: { anoLetivo: true } }, horarioSlots: { select: { id: true }, take: 1 } } },
        },
      },
    },
  });
  const paraDiagnostico: AlunoParaDiagnostico[] = alunos.map((a) => ({
    id: a.id,
    nome: a.nome,
    status: a.status,
    matriculas: a.matriculas.map((m) => ({ id: m.id, status: m.status, anoLetivo: m.turma.anoLetivo })),
    inscricoes: a.inscricoes.map((i) => ({
      id: i.id,
      ativa: i.ativa,
      cadeiraCurricularId: i.cadeiraCurricularId,
      cadeiraNome: i.cadeiraCurricular.disciplina.nome,
      turmaAnoLetivo: i.turmaDisciplina.turma.anoLetivo,
      temHorarioSlot: i.turmaDisciplina.horarioSlots.length > 0,
    })),
  }));
  const violacoes = diagnosticarTodos(paraDiagnostico);
  await prisma.$disconnect();
  return violacoes;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outputDir = path.join(process.cwd(), "scripts", "simulacao", "output", `grande-${Date.now()}`);
  mkdirSync(outputDir, { recursive: true });

  console.log(
    `Contexto: ${args.alunos} alunos, ${args.professores} professores, ${args.secretarias} secretaria(s), ${args.admins} admin(s), ${args.daac} daac — ${args.alunos + args.professores + args.secretarias + args.admins + args.daac} contextos concorrentes.`,
  );
  console.log("A ler contexto seedado...");
  const contexto = await getContextoSimulacao({ professores: args.professores, alunos: args.alunos });
  await disconnect();

  console.log("Relógio simulado: 15 de Setembro de 2026 (início do ano letivo).");
  avancarRelogio(new Date("2026-09-15T09:00:00"));

  const browser = await chromium.launch();
  const inicio = Date.now();

  const tarefasAluno = contexto.alunos.map((credencial: CredencialAgente) =>
    correrAgente(browser, credencial.papel, async (ctx) => {
      const page = await ctx.newPage();
      await visitarComoAluno(page, args.url, credencial, outputDir);
    }),
  );

  const tarefasProfessor = contexto.professores.map((credencial: CredencialAgente) =>
    correrAgente(browser, credencial.papel, async (ctx) => {
      const page = await ctx.newPage();
      return agirComoProfessor(page, args.url, credencial, outputDir, { anoLetivo: 2026 });
    }),
  );

  const tarefasSecretaria = Array.from({ length: args.secretarias }, (_, i) =>
    correrAgente(browser, `secretaria-${i + 1}`, async (ctx) => {
      const page = await ctx.newPage();
      await visitarComoSecretaria(page, args.url, contexto.secretaria, outputDir);
    }),
  );

  const tarefasAdmin = Array.from({ length: args.admins }, (_, i) =>
    correrAgente(browser, `admin-${i + 1}`, async (ctx) => {
      const page = await ctx.newPage();
      await visitarComoAdmin(page, args.url, contexto.admin, outputDir);
    }),
  );

  const tarefasDaac = Array.from({ length: args.daac }, (_, i) =>
    correrAgente(browser, `daac-${i + 1}`, async (ctx) => {
      const page = await ctx.newPage();
      await visitarComoDaac(page, args.url, contexto.daac, outputDir);
    }),
  );

  const resultados = await Promise.all([...tarefasAluno, ...tarefasProfessor, ...tarefasSecretaria, ...tarefasAdmin, ...tarefasDaac]);
  await browser.close();

  const duracaoTotalMs = Date.now() - inicio;
  const falhas = resultados.filter((r) => !r.ok);

  console.log(`\nCorrida concorrente concluída em ${(duracaoTotalMs / 1000).toFixed(1)}s.`);
  console.log(`  Agentes: ${resultados.length} | falharam: ${falhas.length}`);
  for (const falha of falhas) console.log(`  [FALHOU] ${falha.papel}: ${falha.erro}`);

  escreverRelatorioAnomalias(outputDir);

  console.log("\nA correr diagnóstico de integridade...");
  const violacoes = await correrDiagnostico();
  console.log(`diagnóstico: ${violacoes.length} violação(ões).`);
  for (const v of violacoes) console.log(`  [${v.severidade}] ${v.alunoNome}: ${v.detalhe}`);

  const resumo = {
    timestamp: new Date().toISOString(),
    url: args.url,
    totalAgentes: resultados.length,
    duracaoTotalMs,
    agentes: resultados.map(({ papel, ok, duracaoMs, erro }) => ({ papel, ok, duracaoMs, erro })),
    violacoes,
  };
  writeFileSync(path.join(outputDir, "resultado-simulacao.json"), JSON.stringify(resumo, null, 2));

  console.log(`\nSaída completa em: ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
