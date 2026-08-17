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

/**
 * Locator genérico para o texto de erro que quase todos os formulários desta app mostram
 * (text-red-400/600, conforme o fundo). Espera ativamente em vez de um sleep fixo seguido de
 * count() — um Server Action tem um round-trip real, e um timeout curto-demais lia "sem erro"
 * só porque o React ainda não tinha re-renderizado.
 */
export async function textoDeErroVisivel(page: Page, timeoutMs = 4000): Promise<string | null> {
  const erro = page.locator('[class*="text-red-"]').first();
  try {
    await erro.waitFor({ state: "visible", timeout: timeoutMs });
  } catch {
    return null;
  }
  const texto = await erro.textContent();
  return texto?.trim() || null;
}

const TEXTO_ERRO_INESPERADO = ["application error", "internal server error", "something went wrong"];

/**
 * Ao contrário de textoDeErroVisivel (qualquer texto vermelho — útil para "o formulário
 * recusou"), este só apanha sinais de crash real, iguais aos que os agentes calmos já usam
 * (agentes/aluno.ts). Vermelho no ecrã não é sempre um erro: o aviso de bloqueio por dívida
 * ("Tem propinas em atraso...") é vermelho de propósito e é o comportamento CORRETO.
 */
export async function paginaCrashou(page: Page): Promise<string | null> {
  const texto = (await page.textContent("body"))?.toLowerCase() ?? "";
  const encontrado = TEXTO_ERRO_INESPERADO.find((marcador) => texto.includes(marcador));
  return encontrado ?? null;
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

/**
 * instrumentarPagina define 90s de timeout por omissão — generoso de propósito para next dev
 * (primeiro hit compila a rota no Turbopack). Contra next start (produção, sem compilação
 * preguiçosa) isso só mascara um seletor errado como "lento" em vez de "falhou" — 15s chega
 * de sobra e falha depressa o suficiente para não comer o orçamento de 90 minutos do workflow.
 */
export function instrumentarECapturar(page: Page, outputDir: string, papel: string): void {
  instrumentarPagina(page, outputDir, papel);
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(30000);
}

/**
 * Cada cenário caótico corre isolado — um seletor que já não bate certo com a UI atual nunca
 * deve arrastar consigo as ações seguintes do mesmo agente nem, pior, ficar pendurado até ao
 * timeout do job. Falha graciosamente para o próprio relatório, não para o processo.
 */
export async function tentarAcao(label: string, esperadoRejeitado: boolean, fn: () => Promise<AcaoCaotica>): Promise<AcaoCaotica> {
  try {
    return await fn();
  } catch (erro) {
    return {
      label,
      esperadoRejeitado,
      foiRejeitadoGraciosamente: null,
      detalhe: `falhou tecnicamente (seletor desatualizado ou timeout?): ${erro instanceof Error ? erro.message.slice(0, 200) : erro}`,
    };
  }
}

export { registarAnomalia };
