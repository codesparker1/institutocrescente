/**
 * Corrida pequena de validação (plano Fase 11, Verificação — revisto 2026-08-15): 1 de cada papel
 * (aluno, professor, secretaria, admin, DAAC), sem concorrência, contra `npm run dev`. Só para
 * confirmar seletores/relógio simulado — a corrida real dos 15 concorrentes só acontece contra
 * `next build && next start` (o primeiro hit em `dev` compila cada rota no Turbopack, e isso já
 * mostrou levar até 49s numa rota — inaceitável multiplicado por 15 contextos concorrentes).
 *
 * Usage: npx tsx scripts/simulacao/run-pequeno.ts [--url http://localhost:3901]
 */
import { chromium } from "playwright";
import path from "node:path";
import { avancarRelogio } from "./relogio";
import { escreverRelatorioAnomalias } from "./anomalias";
import { visitarComoAluno } from "./agentes/aluno";
import { agirComoProfessor } from "./agentes/professor";
import { visitarComoSecretaria } from "./agentes/secretaria";
import { visitarComoAdmin } from "./agentes/admin";
import { visitarComoDaac } from "./agentes/daac";
import { getContextoSimulacao, disconnect } from "./db-helpers";
import { diagnosticarTodos, type AlunoParaDiagnostico } from "../../src/lib/diagnostico";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });

function parseArgs(argv: string[]) {
  const args = { url: "http://localhost:3901" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--url") args.url = argv[i + 1];
  }
  return args;
}

async function correrDiagnostico(): Promise<void> {
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
  console.log(`\ndiagnóstico: ${violacoes.length} violação(ões).`);
  for (const v of violacoes) console.log(`  [${v.severidade}] ${v.alunoNome}: ${v.detalhe}`);
  await prisma.$disconnect();
}

async function main() {
  const { url } = parseArgs(process.argv.slice(2));
  const outputDir = path.join(process.cwd(), "scripts", "simulacao", "output", `pequeno-${Date.now()}`);

  console.log("A ler contexto seedado...");
  const contexto = await getContextoSimulacao();
  await disconnect();

  console.log(`Relógio simulado: 15 de Setembro de 2026 (início do ano letivo).`);
  avancarRelogio(new Date("2026-09-15T09:00:00"));

  const browser = await chromium.launch();

  console.log(`A visitar como aluno (${contexto.alunos[0].email})...`);
  const paginaAluno = await browser.newPage();
  await visitarComoAluno(paginaAluno, url, contexto.alunos[0], outputDir);
  await paginaAluno.close();

  console.log(`A agir como professor (${contexto.professores[0].email})...`);
  const paginaProfessor = await browser.newPage();
  const resultadoProfessor = await agirComoProfessor(paginaProfessor, url, contexto.professores[0], outputDir, { anoLetivo: 2026 });
  console.log(
    `   -> notas lançadas: ${resultadoProfessor.notasLancadas}, aula criada: ${resultadoProfessor.aulaCriada}, presenças marcadas: ${resultadoProfessor.presencasMarcadas}`,
  );
  await paginaProfessor.close();

  console.log(`A visitar como secretaria (${contexto.secretaria.email})...`);
  const paginaSecretaria = await browser.newPage();
  await visitarComoSecretaria(paginaSecretaria, url, contexto.secretaria, outputDir);
  await paginaSecretaria.close();

  console.log(`A visitar como admin (${contexto.admin.email})...`);
  const paginaAdmin = await browser.newPage();
  await visitarComoAdmin(paginaAdmin, url, contexto.admin, outputDir);
  await paginaAdmin.close();

  console.log(`A visitar como DAAC (${contexto.daac.email})...`);
  const paginaDaac = await browser.newPage();
  await visitarComoDaac(paginaDaac, url, contexto.daac, outputDir);
  await paginaDaac.close();

  await browser.close();

  escreverRelatorioAnomalias(outputDir);
  console.log(`\nRelatório de anomalias em: ${outputDir}`);

  await correrDiagnostico();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
