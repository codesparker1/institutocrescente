import type { Page } from "playwright";
import { DEMO_PASSWORD, type CredencialAgente } from "../../db-helpers";
import { instrumentarPagina, registarAnomalia } from "../../anomalias";

/**
 * Uma ação errática isolada — o relatório distingue "rejeitado como esperado" (a guarda do
 * servidor/UI funcionou), "devia ter sido rejeitado e não foi" (bug real) e "crash inesperado"
 * (já capturado à parte por anomalias.ts, via instrumentarPagina).
 */
export interface AcaoCaotica {
  label: string;
  esperadoRejeitado: boolean;
  foiRejeitadoGraciosamente: boolean | null;
  detalhe?: string;
}

export interface ResultadoAgenteCaotico {
  acoes: AcaoCaotica[];
}

/** Locator genérico para o texto de erro que quase todos os formulários desta app mostram (text-red-400/600, conforme o fundo). */
export async function textoDeErroVisivel(page: Page): Promise<string | null> {
  const erro = page.locator('[class*="text-red-"]').first();
  if ((await erro.count()) === 0) return null;
  const texto = await erro.textContent();
  return texto?.trim() || null;
}

/** Login com password propositadamente errada — ao contrário de agentes/comum.ts's login(), esta espera FICAR em /login com erro visível, nunca redirecionar. */
export async function tentarLoginComPasswordErrada(page: Page, baseUrl: string, credencial: CredencialAgente): Promise<AcaoCaotica> {
  await page.goto(`${baseUrl}/login`);
  await page.fill("#identificador", credencial.email);
  await page.fill("#password", "password-errada-de-propósito");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(800);
  const aindaEmLogin = page.url().includes("/login");
  const erro = await textoDeErroVisivel(page);
  return {
    label: "login com password errada",
    esperadoRejeitado: true,
    foiRejeitadoGraciosamente: aindaEmLogin && erro !== null,
    detalhe: erro ?? undefined,
  };
}

export async function login(page: Page, baseUrl: string, credencial: CredencialAgente): Promise<void> {
  await page.goto(`${baseUrl}/login`);
  await page.fill("#identificador", credencial.email);
  await page.fill("#password", DEMO_PASSWORD);
  await Promise.all([page.waitForURL(/\/(dashboard|professor)/), page.click('button[type="submit"]')]);
}

export function instrumentarECapturar(page: Page, outputDir: string, papel: string): void {
  instrumentarPagina(page, outputDir, papel);
}

export { registarAnomalia };
