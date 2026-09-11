/**
 * Corrige finalistas que ficaram TRANCADO por engano antes de suspenderNaoRematriculados passar a
 * distinguir "concluiu o curso" de "faltou à rematrícula" (§reportado 2026-09-09: "um aluno
 * finalista, depois de defender, no fim do ano o seu estado fica concluído — não é necessário
 * aparecer a mensagem que ele não renovou a matrícula").
 *
 * A correção em src/lib/curriculo.ts só vale a partir de agora — só actua na PRÓXIMA passagem da
 * suspensão automática. Quem já foi trancado por este motivo antes da correção existir fica
 * trancado para sempre, salvo alguém corrigir à mão. Este script é esse à mão, em lote.
 *
 * Critério (o mesmo agora usado em suspenderNaoRematriculados): Aluno TRANCADO cuja monografia
 * (InscricaoCadeira com eMonografiaAplicada) tem uma nota de defesa >= NOTA_MINIMA_POSITIVA. Marca
 * FORMADO e a Matricula mais recente como CONCLUIDA — o mesmo par de escritas do fim de curso
 * normal (processarRematriculaAction) e da própria suspensão automática corrigida.
 *
 * Por omissão só reporta (dry-run). Passar --apply para corrigir a sério.
 *
 * Usage:
 *   npx tsx scripts/corrigir-finalistas-trancados.ts            # só reporta
 *   npx tsx scripts/corrigir-finalistas-trancados.ts --apply    # corrige
 */
import "dotenv/config";
import dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: ".env.local", override: true });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const APLICAR = process.argv.includes("--apply");

// Cópia de src/lib/avaliacao.ts (NOTA_MINIMA_POSITIVA) — não pode ser importado diretamente por
// causa de `import "server-only"` na cadeia de imports (mesma razão documentada nos outros
// scripts de manutenção deste diretório).
const NOTA_MINIMA_POSITIVA = 10;

async function main() {
  const alunosTrancados = await prisma.aluno.findMany({
    where: { status: "TRANCADO" },
    select: {
      id: true,
      nome: true,
      numeroEstudante: true,
      matriculas: {
        orderBy: { turma: { anoLetivo: "desc" } },
        take: 1,
        select: { id: true, status: true, turma: { select: { anoLetivo: true, cursoId: true } } },
      },
      inscricoes: {
        where: { eMonografiaAplicada: true },
        select: {
          notas: { select: { valor: true } },
          turmaDisciplina: { select: { turma: { select: { anoLetivo: true, cursoId: true } } } },
        },
      },
    },
  });

  // §2026-09-11: a monografia tem de ser do MESMO curso e ano letivo da última matrícula — a mesma
  // correção feita em suspenderNaoRematriculados. Sem o âmbito, quem terminou uma licenciatura e
  // começou outra seria "corrigido" para FORMADO no curso novo por causa da monografia do antigo.
  const aCorrigir = alunosTrancados.filter((aluno) => {
    const turmaAtual = aluno.matriculas[0]?.turma;
    if (!turmaAtual) return false;
    return aluno.inscricoes.some(
      (i) =>
        i.turmaDisciplina.turma.cursoId === turmaAtual.cursoId &&
        i.turmaDisciplina.turma.anoLetivo === turmaAtual.anoLetivo &&
        i.notas.some((n) => Number(n.valor) >= NOTA_MINIMA_POSITIVA),
    );
  });

  if (aCorrigir.length === 0) {
    console.log("Nenhum aluno TRANCADO com monografia aprovada encontrado — nada a corrigir.");
    return;
  }

  console.log(`${aCorrigir.length} aluno(s) TRANCADO com monografia aprovada (deviam estar FORMADO):\n`);
  for (const aluno of aCorrigir) {
    const matricula = aluno.matriculas[0];
    console.log(
      `  ${aluno.nome} (${aluno.numeroEstudante}) — última matrícula: ${matricula ? `${matricula.status} (ano letivo ${matricula.turma.anoLetivo})` : "nenhuma"}`,
    );
  }

  if (!APLICAR) {
    console.log(`\nModo relatório (dry-run). Corra com --apply para corrigir estes ${aCorrigir.length} aluno(s).`);
    return;
  }

  const alunoIds = aCorrigir.map((a) => a.id);
  const matriculaIds = aCorrigir.map((a) => a.matriculas[0]?.id).filter((id): id is string => id !== undefined);

  await prisma.$transaction([
    prisma.aluno.updateMany({ where: { id: { in: alunoIds } }, data: { status: "FORMADO" } }),
    prisma.matricula.updateMany({ where: { id: { in: matriculaIds } }, data: { status: "CONCLUIDA" } }),
  ]);

  console.log(`\nCorrigidos ${aCorrigir.length} aluno(s): TRANCADO → FORMADO, matrícula → CONCLUIDA.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
