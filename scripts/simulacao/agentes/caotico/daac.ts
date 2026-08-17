import type { Page, BrowserContext } from "playwright";
import { login, textoDeErroVisivel, instrumentarECapturar } from "./comum";
import type { CredencialAgente } from "../../db-helpers";
import type { AcaoCaotica, ResultadoAgenteCaotico } from "./comum";

interface OpcoesDaacCaotico {
  /** Aluno FORA da janela de matrícula corrente — resolvido pelo orquestrador antes da corrida. */
  alunoForaDaJanelaId?: string;
}

/**
 * DAAC que mexe na configuração académica sem pensar duas vezes: submete datas contraditórias
 * (fim do ano letivo antes do início — já validado no servidor), faz duplo-toggle rápido do
 * semestre, e tenta processar rematrícula de um aluno fora da janela configurada (o formulário
 * nem deve mostrar o botão nesse caso — RematriculaForm.tsx).
 */
export async function agirComoDaacCaotico(
  context: BrowserContext,
  baseUrl: string,
  credencial: CredencialAgente,
  outputDir: string,
  opts: OpcoesDaacCaotico = {},
): Promise<ResultadoAgenteCaotico> {
  const page = await context.newPage();
  instrumentarECapturar(page, outputDir, credencial.papel);
  page.on("dialog", (dialog) => dialog.accept());
  const acoes: AcaoCaotica[] = [];

  await login(page, baseUrl, credencial);

  acoes.push(await submeterDatasContraditorias(page, baseUrl));
  acoes.push(await duploToggleSemestre(page, baseUrl));

  if (opts.alunoForaDaJanelaId) {
    acoes.push(await tentarRematriculaForaDaJanela(page, baseUrl, opts.alunoForaDaJanelaId));
  }

  await page.close();
  return { acoes };
}

async function preencherDateSelect(page: Page, labelTexto: string, valores: { dia: string; mes: string; ano: string }): Promise<void> {
  const span = page.locator(`span:text-is("${labelTexto}")`);
  const container = span.locator("xpath=following-sibling::div[1]");
  await container.locator('select[aria-label="Dia"]').selectOption(valores.dia);
  await container.locator('select[aria-label="Mês"]').selectOption(valores.mes);
  await container.locator('select[aria-label="Ano"]').selectOption(valores.ano);
}

async function submeterDatasContraditorias(page: Page, baseUrl: string): Promise<AcaoCaotica> {
  await page.goto(`${baseUrl}/admin/academico/configuracao`);
  const anoAtual = String(new Date().getFullYear());
  // Fim do ano letivo ANTES do início — atualizarConfiguracaoAcademicaAction já valida isto.
  await preencherDateSelect(page, "Início do ano letivo", { dia: "01", mes: "09", ano: anoAtual });
  await preencherDateSelect(page, "Fim do ano letivo", { dia: "01", mes: "01", ano: anoAtual });
  await page.getByRole("button", { name: "Guardar" }).click();
  await page.waitForTimeout(800);
  const erro = await textoDeErroVisivel(page);
  return {
    label: "configuração académica com anoLetivoFim < anoLetivoInicio",
    esperadoRejeitado: true,
    foiRejeitadoGraciosamente: erro !== null,
    detalhe: erro ?? undefined,
  };
}

async function duploToggleSemestre(page: Page, baseUrl: string): Promise<AcaoCaotica> {
  await page.goto(`${baseUrl}/admin/academico/configuracao`);
  const botao = page.getByRole("button", { name: /Semestre/ }).first();
  if ((await botao.count()) === 0) {
    return { label: "duplo-toggle de semestre", esperadoRejeitado: false, foiRejeitadoGraciosamente: null, detalhe: "botão não encontrado nesta build" };
  }
  await Promise.all([botao.click(), botao.click({ force: true }).catch(() => undefined)]);
  await page.waitForTimeout(800);
  const erro = await textoDeErroVisivel(page);
  return {
    label: "duplo-toggle rápido do semestre atual",
    esperadoRejeitado: false,
    foiRejeitadoGraciosamente: erro === null,
    detalhe: erro ?? undefined,
  };
}

async function tentarRematriculaForaDaJanela(page: Page, baseUrl: string, alunoId: string): Promise<AcaoCaotica> {
  await page.goto(`${baseUrl}/alunos/${alunoId}`);
  const botao = page.getByRole("button", { name: "Processar Rematrícula" });
  const avisoForaDaJanela = page.locator("text=Fora do período de matrícula");
  const bloqueadoNaUi = (await avisoForaDaJanela.count()) > 0 && (await botao.count()) === 0;
  return {
    label: "processar rematrícula fora da janela configurada",
    esperadoRejeitado: true,
    foiRejeitadoGraciosamente: bloqueadoNaUi,
    detalhe: bloqueadoNaUi ? "botão ausente, aviso mostrado" : "botão presente inesperadamente",
  };
}
