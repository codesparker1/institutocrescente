import type { Page, BrowserContext } from "playwright";
import { login, textoDeErroVisivel, instrumentarECapturar } from "./comum";
import type { CredencialAgente } from "../../db-helpers";
import type { AcaoCaotica, ResultadoAgenteCaotico } from "./comum";

/**
 * Admin que cria conflitos de propósito: duas abas a marcar o mesmo horário (mesma turma-
 * disciplina, dia e hora) em simultâneo — só uma deve vencer, encontrarConflito.ts já valida
 * isto sequencialmente, aqui testa-se sob concorrência real — e tenta apagar um curso que ainda
 * tem turmas (deve ser recusado com uma guarda de FK, não crashar).
 */
export async function agirComoAdminCaotico(
  context: BrowserContext,
  baseUrl: string,
  credencial: CredencialAgente,
  outputDir: string,
): Promise<ResultadoAgenteCaotico> {
  const acoes: AcaoCaotica[] = [];

  acoes.push(await conflitoDeHorarioConcorrente(context, baseUrl, credencial, outputDir));

  const page = await context.newPage();
  instrumentarECapturar(page, outputDir, credencial.papel);
  await login(page, baseUrl, credencial);
  acoes.push(await apagarCursoComTurmas(page, baseUrl));
  await page.close();

  return { acoes };
}

async function conflitoDeHorarioConcorrente(context: BrowserContext, baseUrl: string, credencial: CredencialAgente, outputDir: string): Promise<AcaoCaotica> {
  const paginaA = await context.newPage();
  const paginaB = await context.newPage();
  instrumentarECapturar(paginaA, outputDir, credencial.papel);
  instrumentarECapturar(paginaB, outputDir, credencial.papel);

  await login(paginaA, baseUrl, credencial);
  await Promise.all([paginaA.goto(`${baseUrl}/horario`), (async () => { await login(paginaB, baseUrl, credencial); await paginaB.goto(`${baseUrl}/horario`); })()]);

  async function submeterSlot(page: Page): Promise<boolean> {
    const form = page.locator("form", { has: page.locator('input[name="sala"]') }).first();
    if ((await form.count()) === 0) return false;
    await form.locator('input[name="sala"]').fill("Sala Conflito");
    await form.getByRole("button", { name: /Adicionar/ }).click();
    await page.waitForTimeout(1000);
    return (await textoDeErroVisivel(page)) === null;
  }

  const [sucessoA, sucessoB] = await Promise.all([submeterSlot(paginaA), submeterSlot(paginaB)]);
  await paginaA.close();
  await paginaB.close();

  const exatamenteUm = sucessoA !== sucessoB;
  return {
    label: "duas abas a marcar o mesmo horário em simultâneo",
    esperadoRejeitado: false,
    foiRejeitadoGraciosamente: exatamenteUm,
    detalhe: `sucessoA=${sucessoA} sucessoB=${sucessoB}`,
  };
}

async function apagarCursoComTurmas(page: Page, baseUrl: string): Promise<AcaoCaotica> {
  await page.goto(`${baseUrl}/admin/cursos`);
  const primeiroNome = await page.locator("table tbody tr").first().locator("td").first().textContent();
  const botaoRemover = page.getByRole("button", { name: "Remover" }).first();
  if ((await botaoRemover.count()) === 0) {
    return { label: "apagar curso com turmas dependentes", esperadoRejeitado: true, foiRejeitadoGraciosamente: null, detalhe: "sem curso na lista" };
  }
  await botaoRemover.click();
  await page.waitForTimeout(1000);
  await page.goto(`${baseUrl}/admin/cursos`);
  const aindaPresente = (await page.locator(`table tbody tr:has-text("${primeiroNome}")`).count()) > 0;
  return {
    label: "apagar curso que ainda tem turmas",
    esperadoRejeitado: true,
    foiRejeitadoGraciosamente: aindaPresente,
    detalhe: aindaPresente ? "curso continua na lista (rejeitado)" : "curso desapareceu — verificar se tinha mesmo dependentes",
  };
}
