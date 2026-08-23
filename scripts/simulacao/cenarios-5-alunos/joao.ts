/**
 * João Manuel — paga sempre tarde: não paga no marco vencimento-propinas (fica PENDENTE, passa a
 * tolerância, gerarCobrancasDoDia cria a MULTA correspondente ao mês), mas recupera no marco
 * seguinte (avaliacoes-p1) confirmando propina+multa em conjunto. Nunca perde a janela de
 * rematrícula. Acumula uma Cobranca MULTA PAGO por ano — evidência do padrão "sempre atrasado,
 * sempre recupera".
 */
import type { CenarioCtx } from "./tipos";
import { confirmarPropinaMaisAntiga, lancarNotaAluno, guardarNotasPauta, processarRematricula, paraCadaDisciplinaDoProfessor } from "./acoes-comuns";

const NOTA_DISPENSA = 16;

/** Não faz nada no marco vencimento-propinas de propósito — a propina fica por pagar até ao marco seguinte. */
export async function joaoVencimentoPropinas(ctx: CenarioCtx): Promise<void> {
  ctx.log("João: propina do mês NÃO paga de propósito (paga tarde, no marco seguinte).");
}

/** No marco avaliacoes-p1: paga a propina em atraso (agora já com multa gerada por gerarCobrancasDoDia) e lança P1. */
export async function joaoAvaliacoesP1(ctx: CenarioCtx): Promise<void> {
  const ctxBrowser = await ctx.browser.newContext();
  const page = await ctxBrowser.newPage();
  const ok = await confirmarPropinaMaisAntiga(page, ctx.baseUrl, ctx.staff.secretaria, "João Manuel", ctx.outputDir);
  ctx.log(`João: propina+multa em atraso confirmadas em conjunto = ${ok}`);
  await ctxBrowser.close();

  await paraCadaDisciplinaDoProfessor(ctx.browser, ctx.baseUrl, ctx.staff.professor1, ctx.outputDir, async (page) => {
    await lancarNotaAluno(page, "João Manuel", 0, NOTA_DISPENSA);
    await guardarNotasPauta(page);
  });
  await paraCadaDisciplinaDoProfessor(ctx.browser, ctx.baseUrl, ctx.staff.professor2, ctx.outputDir, async (page) => {
    await lancarNotaAluno(page, "João Manuel", 0, NOTA_DISPENSA);
    await guardarNotasPauta(page);
  });
  ctx.log("João: P1 lançado (16) nas duas cadeiras.");
}

export async function joaoAvaliacoesP2(ctx: CenarioCtx): Promise<void> {
  await paraCadaDisciplinaDoProfessor(ctx.browser, ctx.baseUrl, ctx.staff.professor1, ctx.outputDir, async (page) => {
    await lancarNotaAluno(page, "João Manuel", 1, NOTA_DISPENSA);
    await guardarNotasPauta(page);
  });
  await paraCadaDisciplinaDoProfessor(ctx.browser, ctx.baseUrl, ctx.staff.professor2, ctx.outputDir, async (page) => {
    await lancarNotaAluno(page, "João Manuel", 1, NOTA_DISPENSA);
    await guardarNotasPauta(page);
  });
  ctx.log("João: P2 lançado (16) nas duas cadeiras — dispensado em ambas.");
}

export async function joaoJanelaRematricula(ctx: CenarioCtx): Promise<{ alunoId: string; sucesso: boolean; erro: string | null }> {
  const aluno = await ctx.prisma.aluno.findUniqueOrThrow({ where: { email: ctx.alunos.joao.email } });
  const ctxBrowser = await ctx.browser.newContext();
  const page = await ctxBrowser.newPage();
  const resultado = await processarRematricula(page, ctx.baseUrl, ctx.staff.secretaria, aluno.id, ctx.outputDir);
  await ctxBrowser.close();
  ctx.log(`João: rematrícula dentro da janela → sucesso=${resultado.sucesso} ${resultado.erro ?? resultado.resultado ?? ""}`);
  return { alunoId: aluno.id, sucesso: resultado.sucesso, erro: resultado.erro };
}
