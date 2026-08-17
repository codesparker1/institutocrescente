import type { Page } from "playwright";
import { login } from "./comum";
import { instrumentarPagina, registarAnomalia } from "../anomalias";
import type { CredencialAgente } from "../db-helpers";

const TEXTO_ERRO_INESPERADO = ["application error", "internal server error", "something went wrong"];

async function verificarSemErroVisivel(page: Page, outputDir: string, papel: string, onde: string): Promise<void> {
  const texto = (await page.textContent("body"))?.toLowerCase() ?? "";
  const encontrado = TEXTO_ERRO_INESPERADO.find((marcador) => texto.includes(marcador));
  if (encontrado) {
    await registarAnomalia(page, outputDir, papel, `texto de erro ("${encontrado}") visível em ${onde}`);
  }
}

/**
 * Fatia mínima de validação — navegação pelas páginas-chave do papel, sem escrever ainda.
 * Prova de caminho, também, que o split fino do middleware (Fase 10) deixa o DAAC entrar em
 * /admin/curriculo mas continua a barrar /admin/professores.
 */
export async function visitarComoDaac(page: Page, baseUrl: string, credencial: CredencialAgente, outputDir: string): Promise<void> {
  instrumentarPagina(page, outputDir, credencial.papel);

  await login(page, baseUrl, credencial);
  await verificarSemErroVisivel(page, outputDir, credencial.papel, "/dashboard");

  await page.goto(`${baseUrl}/admin/curriculo`);
  await verificarSemErroVisivel(page, outputDir, credencial.papel, "/admin/curriculo");

  await page.goto(`${baseUrl}/admin/academico/configuracao`);
  await verificarSemErroVisivel(page, outputDir, credencial.papel, "/admin/academico/configuracao");

  await page.goto(`${baseUrl}/notas`);
  await verificarSemErroVisivel(page, outputDir, credencial.papel, "/notas");

  // Confirma o gate: DAAC não deve conseguir ver /admin/professores (só ADMIN — middleware.ts).
  await page.goto(`${baseUrl}/admin/professores`);
  await page.waitForURL(/\/dashboard/).catch(async () => {
    await registarAnomalia(page, outputDir, credencial.papel, "DAAC conseguiu aceder a /admin/professores — devia ter sido redirecionado");
  });
}
