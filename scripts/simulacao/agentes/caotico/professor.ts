import type { Page, BrowserContext } from "playwright";
import { login, textoDeErroVisivel, instrumentarECapturar, tentarAcao } from "./comum";
import type { CredencialAgente } from "../../db-helpers";
import type { AcaoCaotica, ResultadoAgenteCaotico } from "./comum";

/**
 * Professor que insiste em mexer em notas fora do que devia: confirma que colunas de época já
 * fechadas (prazoLancamento expirado) continuam bloqueadas na UI mesmo sob pressão, e faz duplo
 * clique rápido em "Guardar alterações" para testar se um duplo-submit do mesmo lote causa
 * alguma coisa estranha (deve ser inofensivo — GradebookEditor esvazia as edições após gravar).
 */
export async function agirComoProfessorCaotico(
  context: BrowserContext,
  baseUrl: string,
  credencial: CredencialAgente,
  outputDir: string,
): Promise<ResultadoAgenteCaotico> {
  const page = await context.newPage();
  instrumentarECapturar(page, outputDir, credencial.papel);
  const acoes: AcaoCaotica[] = [];

  await login(page, baseUrl, credencial);

  const abriu = await abrirPrimeiraDisciplina(page, baseUrl);
  if (!abriu) {
    await page.close();
    return { acoes: [{ label: "professor caótico", esperadoRejeitado: false, foiRejeitadoGraciosamente: null, detalhe: "sem disciplina atribuída" }] };
  }

  acoes.push(await tentarAcao("coluna de época fechada continua bloqueada", true, () => confirmarColunaFechadaBloqueada(page)));
  acoes.push(await tentarAcao("duplo clique em Guardar alterações", false, () => duploCliqueGuardarNotas(page)));

  await page.close();
  return { acoes };
}

async function abrirPrimeiraDisciplina(page: Page, baseUrl: string): Promise<boolean> {
  await page.goto(`${baseUrl}/professor`);
  const link = page.locator("table tbody tr").first().locator("a").first();
  if ((await link.count()) === 0) return false;
  await Promise.all([page.waitForURL(/\/professor\/.+/, { timeout: 20000 }), link.click()]);
  return true;
}

async function confirmarColunaFechadaBloqueada(page: Page): Promise<AcaoCaotica> {
  const inputsDesativados = page.locator('table input[type="number"]:disabled');
  const total = await inputsDesativados.count();
  if (total === 0) {
    return {
      label: "coluna de época fechada continua bloqueada",
      esperadoRejeitado: true,
      foiRejeitadoGraciosamente: null,
      detalhe: "nenhuma época fechada observável nesta disciplina/marco",
    };
  }
  // Já está desativado (atributo disabled do DOM) — a UI já bloqueia antes de sequer chegar ao servidor.
  return { label: "coluna de época fechada continua bloqueada", esperadoRejeitado: true, foiRejeitadoGraciosamente: true, detalhe: `${total} célula(s) bloqueada(s)` };
}

async function duploCliqueGuardarNotas(page: Page): Promise<AcaoCaotica> {
  const inputEditavel = page.locator('table input[type="number"]:not(:disabled)').first();
  if ((await inputEditavel.count()) === 0) {
    return { label: "duplo clique em Guardar alterações", esperadoRejeitado: false, foiRejeitadoGraciosamente: null, detalhe: "sem célula editável nesta disciplina/marco" };
  }
  await inputEditavel.fill("15");
  const botaoGuardar = page.getByRole("button", { name: /Guardar alterações/ });
  await Promise.all([botaoGuardar.click(), botaoGuardar.click({ force: true }).catch(() => undefined)]);
  await page.waitForTimeout(1000);
  const erro = await textoDeErroVisivel(page);
  return {
    label: "duplo clique em Guardar alterações (mesmo lote)",
    esperadoRejeitado: false,
    foiRejeitadoGraciosamente: erro === null,
    detalhe: erro ?? undefined,
  };
}
