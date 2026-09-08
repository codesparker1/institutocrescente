/**
 * Localiza e remove "propinas fantasma" — Cobranca(PROPINA) PENDENTE geradas para uma Matricula já
 * TRANCADA, num mês que não pertence ao ciclo que essa matrícula pagava (§reportado 2026-09-08 e
 * 2026-08-23: "os alunos trancados têm o mês de Outubro para pagar mesmo sendo um novo ano
 * letivo"). A causa raiz — garantirSuspensaoAutomatica e garantirCobrancasGeradas a correr em
 * paralelo dentro do mesmo after() do Next, em vez de em sequência — já está corrigida em
 * src/lib/curriculo.ts e src/lib/financeiro.ts. Este script só limpa o que esse bug já produziu.
 *
 * Deteção: dentro de uma MESMA matriculaId, as propinas nascem sempre em meses consecutivos —
 * gerarPropinasAnoLetivo cria o ciclo inteiro de uma vez, gerarCobrancasDoDia só acrescenta o mês
 * seguinte. Um intervalo (gap) de 2+ meses entre duas propinas da mesma matrícula não tem
 * explicação legítima quando essa matrícula está TRANCADA — é a assinatura exata da corrida: o
 * mês antes do intervalo é o fim do ciclo real; o(s) mês(es) depois do intervalo nasceram da
 * corrida, já depois de a matrícula dever ter deixado de gerar seja o que for.
 *
 * Não mexe em matrículas ATIVAS: uma reativação legítima (mudança de curso, o aluno volta ao curso
 * de origem — ver iniciarNovoCursoAction) também pode deixar um intervalo na mesma matriculaId, mas
 * nesse caso a matrícula está ATIVA outra vez, não TRANCADA — fica de fora por construção.
 *
 * Leva consigo qualquer MULTA (mesmo aluno + mesReferencia) presa a uma propina fantasma: a multa
 * nasce de qualquer propina vencida, sem olhar ao estado da matrícula, por isso uma propina
 * fantasma também gera a sua própria multa fantasma.
 *
 * Nunca apaga uma cobrança com valorPago > 0 — se alguém já pagou contra ela, dinheiro mudou de
 * mãos e a linha fica para revisão manual, reportada mas não tocada.
 *
 * Por omissão só reporta (dry-run). Passar --apply para apagar de facto.
 *
 * Usage:
 *   npx tsx scripts/limpar-propinas-fantasma.ts            # só reporta
 *   npx tsx scripts/limpar-propinas-fantasma.ts --apply    # apaga as fantasmas confirmadas
 */
import "dotenv/config";
import dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: ".env.local", override: true });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const APLICAR = process.argv.includes("--apply");

function chaveMes(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

function mesesDeDiferenca(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

interface Fantasma {
  alunoId: string;
  alunoNome: string;
  numeroEstudante: string;
  alunoStatus: string;
  curso: string;
  anoLetivoTurma: number;
  mesReferencia: Date;
  propinaId: string;
  valorDevido: number;
  bloqueadaPorPagamento: boolean;
}

async function main() {
  const matriculasTrancadas = await prisma.matricula.findMany({
    where: { status: "TRANCADA" },
    select: {
      id: true,
      alunoId: true,
      aluno: { select: { nome: true, numeroEstudante: true, status: true } },
      turma: { select: { anoLetivo: true, curso: { select: { nome: true } } } },
      cobrancas: {
        where: { tipo: "PROPINA" },
        orderBy: { mesReferencia: "asc" },
        select: { id: true, mesReferencia: true, status: true, valorDevido: true, valorPago: true },
      },
    },
  });

  const fantasmas: Fantasma[] = [];

  for (const matricula of matriculasTrancadas) {
    const propinas = matricula.cobrancas.filter(
      (c): c is typeof c & { mesReferencia: Date } => c.mesReferencia !== null,
    );
    if (propinas.length < 2) continue;

    // O último mês ANTES do primeiro gap de 2+ meses é o fim legítimo do ciclo desta matrícula.
    // Tudo o que vem depois de qualquer gap é suspeito.
    let apósGap = false;
    for (let i = 1; i < propinas.length; i++) {
      const anterior = propinas[i - 1];
      const atual = propinas[i];
      if (mesesDeDiferenca(anterior.mesReferencia, atual.mesReferencia) > 1) {
        apósGap = true;
      }
      if (!apósGap) continue;
      if (atual.status !== "PENDENTE") continue; // já paga — não é uma "cobrança fantasma pendente"

      fantasmas.push({
        alunoId: matricula.alunoId,
        alunoNome: matricula.aluno.nome,
        numeroEstudante: matricula.aluno.numeroEstudante,
        alunoStatus: matricula.aluno.status,
        curso: matricula.turma.curso.nome,
        anoLetivoTurma: matricula.turma.anoLetivo,
        mesReferencia: atual.mesReferencia,
        propinaId: atual.id,
        valorDevido: Number(atual.valorDevido),
        bloqueadaPorPagamento: Number(atual.valorPago) > 0,
      });
    }
  }

  if (fantasmas.length === 0) {
    console.log("Nenhuma propina fantasma encontrada.");
    return;
  }

  console.log(`${fantasmas.length} propina(s) fantasma encontrada(s):\n`);
  for (const f of fantasmas) {
    const aviso = f.bloqueadaPorPagamento ? "  ⚠ TEM valorPago > 0 — NÃO será apagada, reveja à mão." : "";
    console.log(
      `  ${f.alunoNome} (${f.numeroEstudante}, ${f.alunoStatus}) · ${f.curso}, turma ${f.anoLetivoTurma} · ` +
        `${chaveMes(f.mesReferencia)} · ${f.valorDevido.toFixed(2)} Kz${aviso}`,
    );
  }

  const apagaveis = fantasmas.filter((f) => !f.bloqueadaPorPagamento);
  const bloqueadas = fantasmas.length - apagaveis.length;
  if (bloqueadas > 0) {
    console.log(`\n${bloqueadas} ficam de fora por já terem pagamento registado — revistas à mão, não apagadas.`);
  }

  if (!APLICAR) {
    console.log(`\nModo relatório (dry-run). Corra com --apply para apagar as ${apagaveis.length} confirmadas.`);
    return;
  }

  if (apagaveis.length === 0) {
    console.log("\nNada para apagar (todas bloqueadas por pagamento).");
    return;
  }

  const propinaIds = apagaveis.map((f) => f.propinaId);

  // Multas presas ao mesmo (alunoId, mesReferencia) de cada propina fantasma — nascem de qualquer
  // propina vencida, sem olhar ao estado da matrícula, e ficam órfãs quando a propina desaparece.
  // Só as sem pagamento: a mesma regra de não apagar dinheiro que já mudou de mãos.
  const multasOrfas = await prisma.cobranca.findMany({
    where: {
      tipo: "MULTA",
      status: "PENDENTE",
      valorPago: 0,
      OR: apagaveis.map((f) => ({ alunoId: f.alunoId, mesReferencia: f.mesReferencia })),
    },
    select: { id: true },
  });

  const [propinasApagadas, multasApagadas] = await prisma.$transaction([
    prisma.cobranca.deleteMany({ where: { id: { in: propinaIds } } }),
    prisma.cobranca.deleteMany({ where: { id: { in: multasOrfas.map((m) => m.id) } } }),
  ]);

  console.log(`\nApagadas ${propinasApagadas.count} propina(s) fantasma e ${multasApagadas.count} multa(s) órfã(s) associada(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
