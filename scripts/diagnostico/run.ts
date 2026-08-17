/**
 * Corre as regras de invariantes de src/lib/diagnostico.ts contra o estado atual da BD e
 * imprime um relatório em markdown, agrupado por aluno (só alunos com violações). Ao contrário
 * do e2e-workflow, isto não simula ações — lê o estado tal como está agora, por isso apanha
 * corrupção deixada por qualquer ação passada, não só as exercitadas neste run.
 *
 * Usage: npm run diagnostico [> relatorio.md]
 */
import "dotenv/config";
import dotenv from "dotenv";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { diagnosticarTodos, type AlunoParaDiagnostico, type Violacao } from "../../src/lib/diagnostico";

dotenv.config({ path: ".env.local", override: true });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function carregarAlunos(): Promise<AlunoParaDiagnostico[]> {
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

  return alunos.map((a) => ({
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
}

function agruparPorAluno(violacoes: Violacao[]): Map<string, Violacao[]> {
  const grupos = new Map<string, Violacao[]>();
  for (const v of violacoes) {
    grupos.set(v.alunoId, [...(grupos.get(v.alunoId) ?? []), v]);
  }
  return grupos;
}

function imprimirRelatorio(violacoes: Violacao[]): void {
  if (violacoes.length === 0) {
    console.log("# Diagnóstico — 0 violações\n\nBD limpa segundo as regras atuais.");
    return;
  }

  const totalErros = violacoes.filter((v) => v.severidade === "ERROR").length;
  const totalAvisos = violacoes.filter((v) => v.severidade === "WARNING").length;
  console.log(`# Diagnóstico — ${totalErros} erro(s), ${totalAvisos} aviso(s)\n`);

  const grupos = agruparPorAluno(violacoes);
  for (const [, vs] of grupos) {
    console.log(`## ${vs[0].alunoNome} (${vs[0].alunoId})\n`);
    for (const v of vs.sort((a, b) => (a.severidade === b.severidade ? 0 : a.severidade === "ERROR" ? -1 : 1))) {
      console.log(`- **${v.severidade}** — \`${v.regra}\`: ${v.detalhe}`);
    }
    console.log("");
  }
}

async function main(): Promise<void> {
  const alunos = await carregarAlunos();
  const violacoes = diagnosticarTodos(alunos);
  imprimirRelatorio(violacoes);
  await prisma.$disconnect();
  process.exitCode = violacoes.some((v) => v.severidade === "ERROR") ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
