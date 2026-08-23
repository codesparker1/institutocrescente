/**
 * Marta Kiala — caminho feliz todos os anos: paga a propina a tempo, todas as cadeiras aprovadas
 * (nota lançada em P1 e P2 o suficiente para dispensa), rematricula dentro da janela. Avança
 * 1º→2º→3º→4º sem incidentes; no 4º ano a tentativa de rematrícula para o "5º ano" é o teste de
 * fim de curso (ver nota no plano) — tratada pelo orquestrador, não aqui.
 */
import type { CenarioCtx } from "./tipos";
import { confirmarPropinaMaisAntiga, lancarNotaAluno, guardarNotasPauta, processarRematricula, paraCadaDisciplinaDoProfessor } from "./acoes-comuns";

/** Nota de dispensa: (P1+P2)/2 >= 14 (notaMinimaDispensaAplicada seedada) — 16/16 dispensa com folga. */
const NOTA_DISPENSA = 16;

export async function martaVencimentoPropinas(ctx: CenarioCtx): Promise<void> {
  const ctxBrowser = await ctx.browser.newContext();
  const page = await ctxBrowser.newPage();
  const ok = await confirmarPropinaMaisAntiga(page, ctx.baseUrl, ctx.staff.secretaria, "Marta Kiala", ctx.outputDir);
  ctx.log(`Marta: propina do mês confirmada a tempo = ${ok}`);
  await ctxBrowser.close();
}

async function lancarNotaMartaEmAmbasCadeiras(ctx: CenarioCtx, colunaIndex: number): Promise<void> {
  await paraCadaDisciplinaDoProfessor(ctx.browser, ctx.baseUrl, ctx.staff.professor1, ctx.outputDir, async (page) => {
    await lancarNotaAluno(page, "Marta Kiala", colunaIndex, NOTA_DISPENSA);
    await guardarNotasPauta(page);
  });
  // Bases de Dados é lecionada por professor2 — professor1 só cobre Programação I.
  await paraCadaDisciplinaDoProfessor(ctx.browser, ctx.baseUrl, ctx.staff.professor2, ctx.outputDir, async (page) => {
    await lancarNotaAluno(page, "Marta Kiala", colunaIndex, NOTA_DISPENSA);
    await guardarNotasPauta(page);
  });
}

export async function martaAvaliacoesP1(ctx: CenarioCtx): Promise<void> {
  await lancarNotaMartaEmAmbasCadeiras(ctx, 0); // P1
  ctx.log("Marta: P1 lançado (16) nas duas cadeiras.");
}

export async function martaAvaliacoesP2(ctx: CenarioCtx): Promise<void> {
  await lancarNotaMartaEmAmbasCadeiras(ctx, 1); // P2 — (16+16)/2=16 >= 14 dispensa
  ctx.log("Marta: P2 lançado (16) nas duas cadeiras — dispensada em ambas.");
}

export async function martaJanelaRematricula(ctx: CenarioCtx): Promise<{ alunoId: string; sucesso: boolean; erro: string | null }> {
  const aluno = await ctx.prisma.aluno.findUniqueOrThrow({ where: { email: ctx.alunos.marta.email } });
  const ctxBrowser = await ctx.browser.newContext();
  const page = await ctxBrowser.newPage();
  const resultado = await processarRematricula(page, ctx.baseUrl, ctx.staff.secretaria, aluno.id, ctx.outputDir);
  await ctxBrowser.close();
  ctx.log(`Marta: rematrícula dentro da janela → sucesso=${resultado.sucesso} ${resultado.erro ?? resultado.resultado ?? ""}`);
  return { alunoId: aluno.id, sucesso: resultado.sucesso, erro: resultado.erro };
}
