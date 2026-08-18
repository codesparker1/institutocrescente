/**
 * Backfill para alunos já matriculados que ficaram sem InscricaoCadeira e/ou Cobranca(PROPINA) —
 * normalmente porque foram criados antes de sincronizarInscricoesTurma/gerarPropinasAnoLetivo
 * correrem automaticamente na matrícula (createAlunoAction), ou antes de gerarPropinasAnoLetivo
 * sequer existir (§pedido do cliente 2026-08-18).
 *
 * As duas funções abaixo (sincronizarInscricoesTurma, gerarPropinasAnoLetivo) são CÓPIAS FIÉIS
 * de src/lib/curriculo.ts e src/lib/financeiro.ts, não uma reimplementação — mas não podem ser
 * importadas diretamente: ambos os ficheiros começam com `import "server-only"`, e esse pacote
 * não está instalado como dependência standalone (o Next.js resolve-o internamente, nunca
 * precisou de estar em node_modules para correr `next build`/`next dev`) — um `tsx` puro fora do
 * Next não o encontra. Se algum dia mudar o comportamento real, atualizar aqui também.
 *
 * Idempotente e seguro de repetir: sincronizarInscricoesTurma só cria o que falta,
 * createMany(skipDuplicates) em gerarPropinasAnoLetivo nunca duplica uma Cobranca já existente.
 * Nunca apaga nada, nunca corre com aPartirDoMes (o aluno já está matriculado desde o início do
 * ciclo atual, ao contrário de uma matrícula nova a meio do ano).
 *
 * Usage: npx tsx scripts/backfill-inscricoes-e-propinas.ts
 */
import "dotenv/config";
import dotenv from "dotenv";
import { PrismaClient, type CategoriaEstudante } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: ".env.local", override: true });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function backfillFrequenciasParaInscricoes(inscricoes: { id: string; turmaDisciplinaId: string }[]): Promise<void> {
  if (inscricoes.length === 0) return;

  const turmaDisciplinaIds = [...new Set(inscricoes.map((i) => i.turmaDisciplinaId))];
  const aulas = await prisma.aula.findMany({
    where: { turmaDisciplinaId: { in: turmaDisciplinaIds } },
    select: { id: true, turmaDisciplinaId: true },
  });
  if (aulas.length === 0) return;

  const aulaIdsPorTurmaDisciplina = new Map<string, string[]>();
  for (const aula of aulas) {
    const lista = aulaIdsPorTurmaDisciplina.get(aula.turmaDisciplinaId) ?? [];
    lista.push(aula.id);
    aulaIdsPorTurmaDisciplina.set(aula.turmaDisciplinaId, lista);
  }

  const novasFrequencias = inscricoes.flatMap((inscricao) =>
    (aulaIdsPorTurmaDisciplina.get(inscricao.turmaDisciplinaId) ?? []).map((aulaId) => ({
      aulaId,
      inscricaoCadeiraId: inscricao.id,
      presente: false,
    })),
  );

  if (novasFrequencias.length > 0) {
    await prisma.frequencia.createMany({ data: novasFrequencias, skipDuplicates: true });
  }
}

async function sincronizarInscricoesTurma(turmaId: string): Promise<void> {
  const [matriculas, turmaDisciplinas] = await Promise.all([
    prisma.matricula.findMany({ where: { turmaId, status: "ATIVA" }, select: { alunoId: true } }),
    prisma.turmaDisciplina.findMany({
      where: { turmaId },
      select: { id: true, cadeiraCurricularId: true, cadeiraCurricular: { select: { permiteDispensa: true, notaMinimaDispensa: true } } },
    }),
  ]);
  if (matriculas.length === 0 || turmaDisciplinas.length === 0) return;

  const alunoIds = matriculas.map((m) => m.alunoId);
  const cadeiraCurricularIds = turmaDisciplinas.map((td) => td.cadeiraCurricularId);

  const inscricoesExistentes = await prisma.inscricaoCadeira.findMany({
    where: { alunoId: { in: alunoIds }, cadeiraCurricularId: { in: cadeiraCurricularIds } },
    select: { alunoId: true, cadeiraCurricularId: true },
  });
  const jaInscrito = new Set(inscricoesExistentes.map((i) => `${i.alunoId}:${i.cadeiraCurricularId}`));

  const novasInscricoes = alunoIds.flatMap((alunoId) =>
    turmaDisciplinas
      .filter((td) => !jaInscrito.has(`${alunoId}:${td.cadeiraCurricularId}`))
      .map((td) => ({
        alunoId,
        cadeiraCurricularId: td.cadeiraCurricularId,
        turmaDisciplinaId: td.id,
        tentativa: 1,
        ativa: true,
        permiteDispensaAplicada: td.cadeiraCurricular.permiteDispensa,
        notaMinimaDispensaAplicada: td.cadeiraCurricular.notaMinimaDispensa,
      })),
  );

  if (novasInscricoes.length > 0) {
    await prisma.inscricaoCadeira.createMany({ data: novasInscricoes, skipDuplicates: true });

    const criadas = await prisma.inscricaoCadeira.findMany({
      where: { tentativa: 1, OR: novasInscricoes.map((n) => ({ alunoId: n.alunoId, cadeiraCurricularId: n.cadeiraCurricularId })) },
      select: { id: true, turmaDisciplinaId: true },
    });
    await backfillFrequenciasParaInscricoes(criadas);
  }
}

function calcularValorPropina(valorBase: number, cadeirasReprovadas: number, percentagemAgravamentoPorCadeira: number) {
  if (cadeirasReprovadas <= 0) return { valorDevido: valorBase, descricao: null as string | null };
  const valorDevido = valorBase * (1 + (percentagemAgravamentoPorCadeira / 100) * cadeirasReprovadas);
  const descricao = `Inclui agravamento por ${cadeirasReprovadas} cadeira(s) em repetição (+${(percentagemAgravamentoPorCadeira * cadeirasReprovadas).toFixed(2)}%)`;
  return { valorDevido, descricao };
}

interface GerarPropinasAnoLetivoParams {
  alunoId: string;
  matriculaId: string;
  categoria: CategoriaEstudante;
  anoCurricular: number;
  cadeirasReprovadas: number;
  anoLetivoAlvo: number;
  configAcademica: { anoLetivoInicio: Date | null; anoLetivoFim: Date | null };
}

async function gerarPropinasAnoLetivo(params: GerarPropinasAnoLetivoParams): Promise<void> {
  const { alunoId, matriculaId, categoria, anoCurricular, cadeirasReprovadas, anoLetivoAlvo, configAcademica } = params;
  if (!configAcademica.anoLetivoInicio || !configAcademica.anoLetivoFim) return;

  const [configFinanceira, precoPropina] = await Promise.all([
    prisma.configuracaoFinanceira.findUnique({ where: { id: "config" } }),
    prisma.precoPropina.findUnique({ where: { categoria_anoCurricular: { categoria, anoCurricular } } }),
  ]);
  if (!precoPropina) return;

  const diaVencimento = configFinanceira?.diaVencimento ?? 10;
  const percentagemAgravamentoPorCadeira = Number(configFinanceira?.percentagemAgravamentoPorCadeira ?? 0);
  const { valorDevido, descricao } = calcularValorPropina(Number(precoPropina.valor), cadeirasReprovadas, percentagemAgravamentoPorCadeira);

  const mesInicio = configAcademica.anoLetivoInicio.getMonth();
  const mesFim = configAcademica.anoLetivoFim.getMonth();
  const inicioCiclo = new Date(anoLetivoAlvo, mesInicio, 1);
  const anoCivilFim = mesFim < mesInicio ? anoLetivoAlvo + 1 : anoLetivoAlvo;
  const fimCiclo = new Date(anoCivilFim, mesFim, 1);

  const meses: Date[] = [];
  for (const cursor = new Date(inicioCiclo); cursor <= fimCiclo; cursor.setMonth(cursor.getMonth() + 1)) {
    meses.push(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  }

  await prisma.cobranca.createMany({
    data: meses.map((mesReferencia) => ({
      matriculaId,
      alunoId,
      tipo: "PROPINA" as const,
      mesReferencia,
      descricao,
      valorDevido,
      dataVencimento: new Date(mesReferencia.getFullYear(), mesReferencia.getMonth(), diaVencimento),
    })),
    skipDuplicates: true,
  });
}

async function main(): Promise<void> {
  const configAcademica = await prisma.configuracaoAcademica.findUnique({ where: { id: "config" } });
  if (!configAcademica) {
    console.log("Sem ConfiguracaoAcademica — nada a fazer.");
    return;
  }

  const matriculasAtivas = await prisma.matricula.findMany({
    where: { status: "ATIVA" },
    include: { turma: true, aluno: true },
  });
  console.log(`${matriculasAtivas.length} matrícula(s) ativa(s) a verificar...`);

  // Diagnóstico: turmas de alunos ativos sem nenhuma TurmaDisciplina atribuída — sincronizarInscricoesTurma
  // não tem como inscrever ninguém numa turma sem disciplinas (o DAAC ainda não montou o plano dessa
  // turma em Admin > Turmas). Isto não é um bug para este script corrigir; fica só reportado.
  const turmaIds = [...new Set(matriculasAtivas.map((m) => m.turmaId))];
  const turmasComDisciplinas = await prisma.turmaDisciplina.findMany({
    where: { turmaId: { in: turmaIds } },
    select: { turmaId: true },
    distinct: ["turmaId"],
  });
  const turmaIdsComDisciplinas = new Set(turmasComDisciplinas.map((t) => t.turmaId));
  const turmasSemDisciplinas = matriculasAtivas
    .filter((m) => !turmaIdsComDisciplinas.has(m.turmaId))
    .reduce((mapa, m) => mapa.set(m.turmaId, `${m.turma.anoCurricular}º Ano (${m.aluno.curso})`), new Map<string, string>());
  if (turmasSemDisciplinas.size > 0) {
    console.log(`\nAviso: ${turmasSemDisciplinas.size} turma(s) sem nenhuma disciplina atribuída — corrija primeiro em Admin > Turmas:`);
    for (const [turmaId, label] of turmasSemDisciplinas) console.log(`  - ${label} (turma ${turmaId})`);
  }

  // Diagnóstico: categoria×ano curricular sem PrecoPropina — gerarPropinasAnoLetivo não inventa
  // valor, só relatado aqui para o operador saber que precisa de preencher em Admin > Preços.
  const precos = await prisma.precoPropina.findMany();
  const precoPorChave = new Set(precos.map((p) => `${p.categoria}:${p.anoCurricular}`));
  const combinacoesSemPreco = matriculasAtivas
    .filter((m) => !precoPorChave.has(`${m.aluno.categoria}:${m.turma.anoCurricular}`))
    .reduce((mapa, m) => mapa.set(`${m.aluno.categoria}:${m.turma.anoCurricular}`, `${m.aluno.categoria} · ${m.turma.anoCurricular}º Ano`), new Map<string, string>());
  if (combinacoesSemPreco.size > 0) {
    console.log(`\nAviso: ${combinacoesSemPreco.size} combinação(ões) categoria×ano sem PrecoPropina — corrija primeiro em Admin > Preços:`);
    for (const label of combinacoesSemPreco.values()) console.log(`  - ${label}`);
  }

  const [inscricoesAntes, propinasAntes] = await Promise.all([
    prisma.inscricaoCadeira.count(),
    prisma.cobranca.count({ where: { tipo: "PROPINA" } }),
  ]);

  console.log("\nA sincronizar inscrições e pré-gerar propinas...");
  const turmasJaSincronizadas = new Set<string>();
  for (const matricula of matriculasAtivas) {
    if (!turmasJaSincronizadas.has(matricula.turmaId)) {
      turmasJaSincronizadas.add(matricula.turmaId);
      await sincronizarInscricoesTurma(matricula.turmaId);
    }
    await gerarPropinasAnoLetivo({
      alunoId: matricula.alunoId,
      matriculaId: matricula.id,
      categoria: matricula.aluno.categoria,
      anoCurricular: matricula.turma.anoCurricular,
      cadeirasReprovadas: matricula.aluno.cadeirasReprovadasAnoAnterior,
      anoLetivoAlvo: matricula.turma.anoLetivo,
      configAcademica,
    });
  }

  const [inscricoesDepois, propinasDepois] = await Promise.all([
    prisma.inscricaoCadeira.count(),
    prisma.cobranca.count({ where: { tipo: "PROPINA" } }),
  ]);

  console.log(
    `\nConcluído: +${inscricoesDepois - inscricoesAntes} inscrição(ões) de cadeira criada(s), +${propinasDepois - propinasAntes} cobrança(s) de propina criada(s).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
