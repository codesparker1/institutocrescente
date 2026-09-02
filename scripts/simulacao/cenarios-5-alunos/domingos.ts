/**
 * Domingos Cavaco — cenário mais complexo dos 5:
 *
 * 1º ano do ciclo: NÃO paga a propina (fica PENDENTE além do fim do ano letivo → TRANCADO
 * automático, igual a Beatriz), E não rematricula na janela (mesmo motivo — nem podia, tem dívida).
 * No marco extra pós-rollover, a ADMIN primeiro paga a dívida de PROPINA via /financeiro/registo
 * (só isso desbloqueia — multas nunca bloqueiam, ver verificarBloqueioAluno) e só depois processa a
 * rematrícula tardia — que deve gerar uma multa órfã se valorMultaRematriculaTardia > 0 (o
 * orquestrador garante isto no setup, subindo o valor se a seed o deixou a 0).
 *
 * 2º ano do ciclo: reprova numa das duas cadeiras (nota abaixo do mínimo lançada de propósito no
 * Exame) — testa decidirRematricula/cadeirasARepetir com 1 reprovação contra limiteReprovacoes=2
 * (seedado) — deve AVANÇAR retendo só essa cadeira (tentativa=2), não ficar retido no ano.
 */
import type { CenarioCtx } from "./tipos";
import { lancarNotaAluno, guardarNotasPauta, processarRematricula, paraCadaDisciplinaDoProfessor, confirmarPropinaMaisAntiga } from "./acoes-comuns";

const NOTA_DISPENSA = 16;
/** Abaixo do mínimo positivo (10) mesmo depois da cascata de Exame — força REPROVADO. */
const NOTA_REPROVACAO = 5;

/** Não faz nada — a propina do 1º ano fica deliberadamente por pagar até depois do rollover. */
export async function domingosVencimentoPropinas(ctx: CenarioCtx): Promise<void> {
  ctx.log("Domingos: propina do 1º ano NÃO paga de propósito (fica em dívida além do fim do ano letivo).");
}

async function lancarNotaDomingosEmAmbasCadeiras(ctx: CenarioCtx, colunaIndex: number, valor: number): Promise<void> {
  await paraCadaDisciplinaDoProfessor(
    ctx.browser,
    ctx.baseUrl,
    ctx.staff.professor1,
    ctx.outputDir,
    async (page) => {
      await lancarNotaAluno(page, "Domingos Cavaco", colunaIndex, valor);
      await guardarNotasPauta(page);
    },
    { prisma: ctx.prisma, semestreParaVisita: 1 },
  );
  await paraCadaDisciplinaDoProfessor(
    ctx.browser,
    ctx.baseUrl,
    ctx.staff.professor2,
    ctx.outputDir,
    async (page) => {
      await lancarNotaAluno(page, "Domingos Cavaco", colunaIndex, valor);
      await guardarNotasPauta(page);
    },
    { prisma: ctx.prisma, semestreParaVisita: 2 },
  );
}

/** 1º ano: aprovação normal nas duas cadeiras (o cenário dele neste ano é só financeiro/rematrícula). */
export async function domingosAvaliacoesP1Ano1(ctx: CenarioCtx): Promise<void> {
  await lancarNotaDomingosEmAmbasCadeiras(ctx, 0, NOTA_DISPENSA);
  ctx.log("Domingos (1º ano): P1 lançado (16) nas duas cadeiras.");
}

export async function domingosAvaliacoesP2Ano1(ctx: CenarioCtx): Promise<void> {
  await lancarNotaDomingosEmAmbasCadeiras(ctx, 1, NOTA_DISPENSA);
  ctx.log("Domingos (1º ano): P2 lançado (16) nas duas cadeiras — dispensado em ambas.");
}

/**
 * 2º ano: Programação I (professor1) continua dispensado; a cadeira do 2º semestre (§faculdade-de-verdade:
 * no 2º ano "Redes de Computadores") reprova — nota baixa em P1+P2 força Exame, onde recebe nota abaixo
 * do mínimo (5) e fecha REPROVADO.
 * nota baixa em P1+P2 (sem dispensa) força a cascata a passar por Exame, onde recebe nota abaixo do
 * mínimo (5) e fecha REPROVADO. `professorLabel` distingue as duas disciplinas na chamada.
 *
 * §2026-09-02: deixou de haver prazo a repor — o prazo automático por época foi substituído pelo
 * interruptor manual global (ConfiguracaoAcademica.lancamentoNotasAberto), aberto uma vez no setup
 * da simulação. O que esta função continua a garantir é que a Avaliacao EXISTE com data já passada:
 * sem isso o gate PROVA_POR_REALIZAR (motivoLancamentoFechado) bloqueia o input do professor e as
 * notas do Domingos nunca são gravadas — lancarNotaAluno devolve false em silêncio (visto na
 * corrida v2: inscrição de 2027 ficou SEM notas, sem reprovação, sem repetição).
 */
async function garantirAvaliacoesDisciplinaSemestre2(ctx: CenarioCtx, epocas: ("P1" | "P2" | "EXAME")[], dataProva: Date): Promise<void> {
  // §faculdade-de-verdade: a disciplina do 2º semestre muda por ano — no 2º ano é "Redes de Computadores".
  const inscricao = await ctx.prisma.inscricaoCadeira.findFirstOrThrow({
    where: {
      ativa: true,
      aluno: { email: ctx.alunos.domingos.email },
      turmaDisciplina: { disciplina: { nome: ctx.disciplinaSemestre2 } },
    },
    include: { turmaDisciplina: { select: { id: true } } },
  });
  const turmaDisciplinaId = inscricao.turmaDisciplina.id;
  for (const epoca of epocas) {
    await ctx.prisma.avaliacao.upsert({
      where: { turmaDisciplinaId_epoca: { turmaDisciplinaId, epoca } },
      update: { data: dataProva },
      create: { turmaDisciplinaId, epoca, data: dataProva, sala: "Lab 2" },
    });
  }
}

export async function domingosAvaliacoesP1Ano2(ctx: CenarioCtx): Promise<void> {
  // P1 de Bases de Dados ainda não existe (só a P2 da Isabel) — nasce aqui, com data já passada.
  await garantirAvaliacoesDisciplinaSemestre2(ctx, ["P1"], new Date());
  await paraCadaDisciplinaDoProfessor(
    ctx.browser,
    ctx.baseUrl,
    ctx.staff.professor1,
    ctx.outputDir,
    async (page) => {
      await lancarNotaAluno(page, "Domingos Cavaco", 0, NOTA_DISPENSA);
      await guardarNotasPauta(page);
    },
    { prisma: ctx.prisma, semestreParaVisita: 1 },
  );
  await paraCadaDisciplinaDoProfessor(
    ctx.browser,
    ctx.baseUrl,
    ctx.staff.professor2,
    ctx.outputDir,
    async (page) => {
      await lancarNotaAluno(page, "Domingos Cavaco", 0, NOTA_REPROVACAO); // P1 baixo — evita dispensa
      await guardarNotasPauta(page);
    },
    { prisma: ctx.prisma, semestreParaVisita: 2 },
  );
  ctx.log("Domingos (2º ano): P1 — 16 em Prog. I, 5 em Bases de Dados (a caminho da reprovação).");
}

export async function domingosAvaliacoesP2Ano2(ctx: CenarioCtx): Promise<void> {
  // A P2 já existe (criada pela Isabel); o EXAME nasce aqui. Ambas com data já passada.
  await garantirAvaliacoesDisciplinaSemestre2(ctx, ["P2", "EXAME"], new Date());
  await paraCadaDisciplinaDoProfessor(
    ctx.browser,
    ctx.baseUrl,
    ctx.staff.professor1,
    ctx.outputDir,
    async (page) => {
      await lancarNotaAluno(page, "Domingos Cavaco", 1, NOTA_DISPENSA);
      await guardarNotasPauta(page);
    },
    { prisma: ctx.prisma, semestreParaVisita: 1 },
  );
  await paraCadaDisciplinaDoProfessor(
    ctx.browser,
    ctx.baseUrl,
    ctx.staff.professor2,
    ctx.outputDir,
    async (page) => {
      // P2 também baixo: (5+5)/2=5 < notaMinimaDispensa(14) — cai em ADMITIDO_A_EXAME, exige Exame.
      await lancarNotaAluno(page, "Domingos Cavaco", 1, NOTA_REPROVACAO);
      await guardarNotasPauta(page);
      // Mesma passagem pela pauta: já lança o Exame também baixo, para fechar REPROVADO sem precisar
      // de outro marco — (média=5+exame=5)/2=5 < 10, cascata fecha REPROVADO nesta mesma visita.
      await lancarNotaAluno(page, "Domingos Cavaco", 2, NOTA_REPROVACAO);
      await guardarNotasPauta(page);
    },
    { prisma: ctx.prisma, semestreParaVisita: 2 },
  );
  ctx.log("Domingos (2º ano): P2+Exame baixos em Bases de Dados — cadeira deve fechar REPROVADO.");
}

/** Janela de rematrícula normal (2º ano em diante) — sem dívida, decisão de avançar/reter é da lógica de negócio. */
export async function domingosJanelaRematricula(ctx: CenarioCtx): Promise<{ alunoId: string; sucesso: boolean; erro: string | null }> {
  const aluno = await ctx.prisma.aluno.findUniqueOrThrow({ where: { email: ctx.alunos.domingos.email } });
  const ctxBrowser = await ctx.browser.newContext();
  const page = await ctxBrowser.newPage();
  const resultado = await processarRematricula(page, ctx.baseUrl, ctx.staff.secretaria, aluno.id, ctx.outputDir);
  await ctxBrowser.close();
  ctx.log(`Domingos: rematrícula dentro da janela → sucesso=${resultado.sucesso} ${resultado.erro ?? resultado.resultado ?? ""}`);
  return { alunoId: aluno.id, sucesso: resultado.sucesso, erro: resultado.erro };
}

/**
 * Marco extra pós-fim-de-ano-letivo do 1º ano: primeiro a ADMIN paga a dívida de PROPINA em
 * atraso de Domingos (só isso desbloqueia a rematrícula), só depois processa a rematrícula tardia
 * (que deve gerar a multa órfã, se valorMultaRematriculaTardia > 0 — garantido pelo setup do
 * orquestrador).
 */
export async function domingosPagarDividaERematriculaTardia(
  ctx: CenarioCtx,
): Promise<{ alunoId: string; sucesso: boolean; erro: string | null }> {
  const aluno = await ctx.prisma.aluno.findUniqueOrThrow({ where: { email: ctx.alunos.domingos.email } });

  const ctxPagamento = await ctx.browser.newContext();
  const pagePagamento = await ctxPagamento.newPage();
  // ADMIN (não SECRETARIA): mesma sessão que depois processa a rematrícula tardia — e é a ADMIN
  // quem tem podeForaDaJanela=true em RematriculaForm, por isso já tem de ser esta sessão aqui.
  const pagoOk = await confirmarPropinaMaisAntiga(pagePagamento, ctx.baseUrl, ctx.staff.admin, "Domingos Cavaco", ctx.outputDir);
  await ctxPagamento.close();
  ctx.log(`Domingos: dívida de propina do 1º ano paga pela ADMIN (pós-rollover) = ${pagoOk}`);

  const ctxRematricula = await ctx.browser.newContext();
  const pageRematricula = await ctxRematricula.newPage();
  const resultado = await processarRematricula(pageRematricula, ctx.baseUrl, ctx.staff.admin, aluno.id, ctx.outputDir);
  await ctxRematricula.close();
  ctx.log(`Domingos: rematrícula TARDIA (ADMIN, pós-rollover) → sucesso=${resultado.sucesso} ${resultado.erro ?? resultado.resultado ?? ""}`);
  return { alunoId: aluno.id, sucesso: resultado.sucesso, erro: resultado.erro };
}
