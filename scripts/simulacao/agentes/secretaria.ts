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

/** Fatia mínima de validação — navegação pelas páginas-chave do papel, sem escrever ainda. */
export async function visitarComoSecretaria(page: Page, baseUrl: string, credencial: CredencialAgente, outputDir: string): Promise<void> {
  instrumentarPagina(page, outputDir, credencial.papel);

  await login(page, baseUrl, credencial);
  await verificarSemErroVisivel(page, outputDir, credencial.papel, "/dashboard");

  await page.goto(`${baseUrl}/alunos`);
  await verificarSemErroVisivel(page, outputDir, credencial.papel, "/alunos");

  await page.goto(`${baseUrl}/financeiro/registo`);
  await verificarSemErroVisivel(page, outputDir, credencial.papel, "/financeiro/registo");

  await page.goto(`${baseUrl}/financeiro/devedores`);
  await verificarSemErroVisivel(page, outputDir, credencial.papel, "/financeiro/devedores");
}
