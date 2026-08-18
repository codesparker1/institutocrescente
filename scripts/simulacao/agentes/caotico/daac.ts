import type { Page, BrowserContext } from "playwright";
import { login, textoDeErroVisivel, instrumentarECapturar, tentarAcao } from "./comum";
import type { CredencialAgente } from "../../db-helpers";
import type { AcaoCaotica, ResultadoAgenteCaotico } from "./comum";

/**
 * DAAC que mexe na configuração académica sem pensar duas vezes: submete datas contraditórias
 * (fim do ano letivo antes do início — já validado no servidor) e faz duplo-toggle rápido do
 * semestre. (O cenário de rematrícula fora da janela mudou para secretaria.ts — ver o achado no
 * histórico do cost-meter: DAAC nunca teve acesso à secção de Rematrícula, `RematriculaForm` é
 * gated por podeRegistarPagamento/podeEditarCategoria, ADMIN/SECRETARIA só. Testar com DAAC não
 * exercitava nada — a secção inteira nunca renderizava para esse papel.)
 */
export async function agirComoDaacCaotico(
  context: BrowserContext,
  baseUrl: string,
  credencial: CredencialAgente,
  outputDir: string,
): Promise<ResultadoAgenteCaotico> {
  const page = await context.newPage();
  instrumentarECapturar(page, outputDir, credencial.papel);
  page.on("dialog", (dialog) => dialog.accept());
  const acoes: AcaoCaotica[] = [];

  await login(page, baseUrl, credencial);

  acoes.push(await tentarAcao("configuração académica com anoLetivoFim < anoLetivoInicio", true, () => submeterDatasContraditorias(page, baseUrl)));
  acoes.push(await tentarAcao("duplo-toggle rápido do semestre atual", false, () => duploToggleSemestre(page, baseUrl)));

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
  // SemestreAtualCard.tsx mostra DOIS botões "1º/2º Semestre" lado a lado — o do semestre CORRENTE
  // vem sempre disabled (não faz sentido "mudar" para o que já está ativo). Um regex genérico
  // /Semestre/ com .first() apanha os dois indiscriminadamente e, quando o corrente é o 1º, cai
  // sempre no desativado — Playwright fica a tentar clicar até ao timeout, nunca desiste sozinho.
  const botao = page.locator("button:not([disabled])", { hasText: "Semestre" }).first();
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

