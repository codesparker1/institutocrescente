/**
 * Recalcula Aluno.cadeirasReprovadasAnoAnterior/cadeirasReprovadasSemestre2AnoAnterior a partir
 * das inscrições ATIVAS reais (tentativa > 1, excluindo monografia) e reaplica o agravamento às
 * mensalidades ainda por vencer — corrige quem já estava a repetir uma cadeira antes de
 * criarTentativaRepeticaoAction passar a atualizar estes contadores (§reportado 2026-09-09: um
 * aluno a repetir continuava a pagar só o valor base, sem o agravamento de 12%).
 *
 * Os dois pontos que escrevem estes contadores (processarRematriculaAction,
 * criarTentativaRepeticaoAction) só o fazem no MOMENTO em que criam a repetição — uma inscrição já
 * existente antes desse código existir nunca é tocada retroativamente. Este script fecha esse
 * fosso de uma vez, e serve também de rede de segurança se algum dia os contadores voltarem a
 * divergir da realidade (repetições apagadas à mão na BD, por exemplo).
 *
 * CÓPIAS de src/lib/financeiro.ts (calcularValorPropina, calcularCadeirasReprovadasEfetivas,
 * recalcularAgravamentoPendentes) — não podem ser importadas diretamente por causa de
 * `import "server-only"` no topo desse ficheiro (mesma razão documentada em
 * backfill-inscricoes-e-propinas.ts). Manter em sincronia se a lógica lá mudar.
 *
 * Por omissão só reporta (dry-run). Passar --apply para corrigir a sério.
 *
 * Usage:
 *   npx tsx scripts/recalcular-cadeiras-reprovadas.ts            # só reporta
 *   npx tsx scripts/recalcular-cadeiras-reprovadas.ts --apply    # corrige
 */
import "dotenv/config";
import dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: ".env.local", override: true });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const APLICAR = process.argv.includes("--apply");

function calcularValorPropina(valorBase: number, cadeirasReprovadas: number, percentagem: number) {
  if (cadeirasReprovadas <= 0) return { valorDevido: valorBase, descricao: null as string | null };
  const valorDevido = valorBase * (1 + (percentagem / 100) * cadeirasReprovadas);
  const descricao = `Inclui agravamento por ${cadeirasReprovadas} cadeira(s) em repetição (+${(percentagem * cadeirasReprovadas).toFixed(2)}%)`;
  return { valorDevido, descricao };
}

function cadeirasEfetivas(total: number, semestre2: number, ligado: boolean, semestreAtual: number) {
  if (!ligado || semestreAtual >= 2) return total;
  return total - semestre2;
}

async function getAgora(): Promise<Date> {
  if (process.env.SIMULATION_MODE !== "true") return new Date();
  const relogio = await prisma.relogioSimulado.findUnique({ where: { id: "config" } });
  return relogio?.agora ?? new Date();
}

async function main() {
  const alunos = await prisma.aluno.findMany({
    where: { status: "ATIVO" },
    select: {
      id: true,
      nome: true,
      numeroEstudante: true,
      categoria: true,
      cadeirasReprovadasAnoAnterior: true,
      cadeirasReprovadasSemestre2AnoAnterior: true,
      inscricoes: {
        where: { ativa: true, tentativa: { gt: 1 }, eMonografiaAplicada: false },
        select: { cadeiraCurricular: { select: { semestre: true } } },
      },
      matriculas: {
        where: { status: "ATIVA" },
        select: { turma: { select: { anoCurricular: true } } },
        take: 1,
      },
    },
  });

  const divergentes = alunos
    .map((aluno) => {
      const totalReal = aluno.inscricoes.length;
      const semestre2Real = aluno.inscricoes.filter((i) => i.cadeiraCurricular.semestre === 2).length;
      return { aluno, totalReal, semestre2Real };
    })
    .filter(
      ({ aluno, totalReal, semestre2Real }) =>
        aluno.cadeirasReprovadasAnoAnterior !== totalReal || aluno.cadeirasReprovadasSemestre2AnoAnterior !== semestre2Real,
    );

  if (divergentes.length === 0) {
    console.log("Nenhum desfasamento encontrado — os contadores já batem certo com as repetições ativas.");
    return;
  }

  console.log(`${divergentes.length} aluno(s) com contadores desfasados:\n`);
  for (const { aluno, totalReal, semestre2Real } of divergentes) {
    console.log(
      `  ${aluno.nome} (${aluno.numeroEstudante}) — guardado: total=${aluno.cadeirasReprovadasAnoAnterior} sem2=${aluno.cadeirasReprovadasSemestre2AnoAnterior} | real: total=${totalReal} sem2=${semestre2Real}`,
    );
  }

  if (!APLICAR) {
    console.log(`\nModo relatório (dry-run). Corra com --apply para corrigir estes ${divergentes.length} aluno(s).`);
    return;
  }

  const [config, configAcademica, precos] = await Promise.all([
    prisma.configuracaoFinanceira.findUnique({ where: { id: "config" } }),
    prisma.configuracaoAcademica.findUnique({ where: { id: "config" }, select: { semestreAtual: true } }),
    prisma.precoPropina.findMany(),
  ]);
  const percentagem = Number(config?.percentagemAgravamentoPorCadeira ?? 0);
  const ligado = config?.agravamentoSoNoSemestreDaCadeira ?? false;
  const semestreAtual = configAcademica?.semestreAtual ?? 1;
  const precoPorChave = new Map(precos.map((p) => [`${p.categoria}:${p.anoCurricular}`, Number(p.valor)]));
  const agora = await getAgora();
  const inicioMesAtual = new Date(agora.getFullYear(), agora.getMonth(), 1);

  let mensalidadesCorrigidas = 0;
  for (const { aluno, totalReal, semestre2Real } of divergentes) {
    await prisma.aluno.update({
      where: { id: aluno.id },
      data: { cadeirasReprovadasAnoAnterior: totalReal, cadeirasReprovadasSemestre2AnoAnterior: semestre2Real },
    });

    const anoCurricular = aluno.matriculas[0]?.turma.anoCurricular;
    if (anoCurricular === undefined) continue; // sem matrícula ativa — nada por vencer para corrigir
    const valorBase = precoPorChave.get(`${aluno.categoria}:${anoCurricular}`);
    if (valorBase === undefined) continue; // sem preço configurado — não inventa valor

    const efetivas = cadeirasEfetivas(totalReal, semestre2Real, ligado, semestreAtual);
    const { valorDevido, descricao } = calcularValorPropina(valorBase, efetivas, percentagem);
    const resultado = await prisma.cobranca.updateMany({
      where: { alunoId: aluno.id, tipo: "PROPINA", status: "PENDENTE", mesReferencia: { gte: inicioMesAtual } },
      data: { valorDevido, descricao },
    });
    mensalidadesCorrigidas += resultado.count;
  }

  console.log(`\nCorrigidos ${divergentes.length} aluno(s) e recalculadas ${mensalidadesCorrigidas} mensalidade(s) por vencer.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
