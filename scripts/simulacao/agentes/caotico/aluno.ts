import type { BrowserContext } from "playwright";
import { login, paginaCrashou, instrumentarECapturar, tentarAcao } from "./comum";
import type { CredencialAgente } from "../../db-helpers";
import type { AcaoCaotica, ResultadoAgenteCaotico } from "./comum";

const REFRESH_AGRESSIVO = 6;

/** Aluno que martela refresh em vez de esperar a página carregar — sobretudo em horas de pico. */
export async function agirComoAlunoCaotico(
  context: BrowserContext,
  baseUrl: string,
  credencial: CredencialAgente,
  outputDir: string,
): Promise<ResultadoAgenteCaotico> {
  const page = await context.newPage();
  instrumentarECapturar(page, outputDir, credencial.papel);
  await login(page, baseUrl, credencial);

  const acoes: AcaoCaotica[] = [];
  for (const rota of ["/minhas-notas", "/horario", "/financeiro"]) {
    acoes.push(await tentarAcao(`refresh agressivo em ${rota}`, false, () => refrescarAgressivamente(page, baseUrl, rota)));
  }

  await page.close();
  return { acoes };
}

async function refrescarAgressivamente(page: import("playwright").Page, baseUrl: string, rota: string): Promise<AcaoCaotica> {
  await page.goto(`${baseUrl}${rota}`);
  for (let i = 0; i < REFRESH_AGRESSIVO; i += 1) {
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
  }
  await page.waitForTimeout(500);
  const crash = await paginaCrashou(page);
  return {
    label: `refresh agressivo (${REFRESH_AGRESSIVO}x) em ${rota}`,
    esperadoRejeitado: false,
    foiRejeitadoGraciosamente: crash === null,
    detalhe: crash ?? undefined,
  };
}
