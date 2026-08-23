/**
 * Beatriz Sacatucua — no 1º ano do ciclo, não rematricula dentro da janela (fica TRANCADA
 * automaticamente pela garantirSuspensaoAutomatica quando anoLetivoFim passa e ninguém rematriculou
 * por ela); a ADMIN processa a rematrícula tardia dela no marco extra pós-fim-de-ano-letivo, depois
 * de rolloverTurmas já ter criado a turma do ano seguinte. Do 2º ano em diante, comportamento
 * idêntico ao de Marta (paga a tempo, rematricula dentro da janela) — testa que um trancamento não
 * deixa sequelas nos anos seguintes.
 */
import type { CenarioCtx } from "./tipos";
import { confirmarPropinaMaisAntiga, lancarNotaAluno, guardarNotasPauta, processarRematricula, paraCadaDisciplinaDoProfessor } from "./acoes-comuns";

const NOTA_DISPENSA = 16;

export async function beatrizVencimentoPropinas(ctx: CenarioCtx): Promise<void> {
  const ctxBrowser = await ctx.browser.newContext();
  const page = await ctxBrowser.newPage();
  const ok = await confirmarPropinaMaisAntiga(page, ctx.baseUrl, ctx.staff.secretaria, "Beatriz Sacatucua", ctx.outputDir);
  ctx.log(`Beatriz: propina do mês confirmada a tempo = ${ok}`);
  await ctxBrowser.close();
}

async function lancarNotaBeatrizEmAmbasCadeiras(ctx: CenarioCtx, colunaIndex: number): Promise<void> {
  await paraCadaDisciplinaDoProfessor(ctx.browser, ctx.baseUrl, ctx.staff.professor1, ctx.outputDir, async (page) => {
    await lancarNotaAluno(page, "Beatriz Sacatucua", colunaIndex, NOTA_DISPENSA);
    await guardarNotasPauta(page);
  });
  await paraCadaDisciplinaDoProfessor(ctx.browser, ctx.baseUrl, ctx.staff.professor2, ctx.outputDir, async (page) => {
    await lancarNotaAluno(page, "Beatriz Sacatucua", colunaIndex, NOTA_DISPENSA);
    await guardarNotasPauta(page);
  });
}

export async function beatrizAvaliacoesP1(ctx: CenarioCtx): Promise<void> {
  await lancarNotaBeatrizEmAmbasCadeiras(ctx, 0);
  ctx.log("Beatriz: P1 lançado (16) nas duas cadeiras.");
}

export async function beatrizAvaliacoesP2(ctx: CenarioCtx): Promise<void> {
  await lancarNotaBeatrizEmAmbasCadeiras(ctx, 1);
  ctx.log("Beatriz: P2 lançado (16) nas duas cadeiras — dispensada em ambas.");
}

/** Janela de rematrícula normal — só chamada a partir do 2º ano do ciclo (ver orquestrador). */
export async function beatrizJanelaRematricula(ctx: CenarioCtx): Promise<{ alunoId: string; sucesso: boolean; erro: string | null }> {
  const aluno = await ctx.prisma.aluno.findUniqueOrThrow({ where: { email: ctx.alunos.beatriz.email } });
  const ctxBrowser = await ctx.browser.newContext();
  const page = await ctxBrowser.newPage();
  const resultado = await processarRematricula(page, ctx.baseUrl, ctx.staff.secretaria, aluno.id, ctx.outputDir);
  await ctxBrowser.close();
  ctx.log(`Beatriz: rematrícula dentro da janela → sucesso=${resultado.sucesso} ${resultado.erro ?? resultado.resultado ?? ""}`);
  return { alunoId: aluno.id, sucesso: resultado.sucesso, erro: resultado.erro };
}

/**
 * Marco extra pós-fim-de-ano-letivo do 1º ano: a ADMIN processa a rematrícula tardia de Beatriz —
 * já deve estar TRANCADA (suspensão automática) e sem dívida de PROPINA (pagou sempre a tempo, só
 * faltou o gesto de rematricular). Nota: como valorMultaRematriculaTardia > 0 é definido globalmente
 * no setup do orquestrador (para o cenário do Domingos), esta rematrícula tardia TAMBÉM gera uma
 * multa órfã para Beatriz — não é um cenário "sem multa" isolado, é o mesmo mecanismo de
 * rematriculaTardia aplicado a um aluno cuja ÚNICA causa do trancamento foi perder a janela (ao
 * contrário do Domingos, que também tinha dívida). A verificação final não exige nem rejeita essa
 * multa para Beatriz — o foco dela é o próprio trancamento/destrancamento, não o valor da multa.
 */
export async function beatrizRematriculaTardiaPosRollover(ctx: CenarioCtx): Promise<{ alunoId: string; sucesso: boolean; erro: string | null }> {
  const aluno = await ctx.prisma.aluno.findUniqueOrThrow({ where: { email: ctx.alunos.beatriz.email } });
  const ctxBrowser = await ctx.browser.newContext();
  const page = await ctxBrowser.newPage();
  const resultado = await processarRematricula(page, ctx.baseUrl, ctx.staff.admin, aluno.id, ctx.outputDir);
  await ctxBrowser.close();
  ctx.log(`Beatriz: rematrícula TARDIA (ADMIN, pós-rollover) → sucesso=${resultado.sucesso} ${resultado.erro ?? resultado.resultado ?? ""}`);
  return { alunoId: aluno.id, sucesso: resultado.sucesso, erro: resultado.erro };
}
