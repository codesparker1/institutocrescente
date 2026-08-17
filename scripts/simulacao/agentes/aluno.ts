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
 * O que um aluno faz num marco do ano: consultar o seu próprio estado (horário, notas, propinas)
 * — o aluno não escreve nada no sistema fora do login, é sempre leitura. As escritas do ano
 * (lançar aula/nota, agendar prova, processar pagamento/rematrícula) são dos outros 5 papéis.
 */
export async function visitarComoAluno(page: Page, baseUrl: string, credencial: CredencialAgente, outputDir: string): Promise<void> {
  instrumentarPagina(page, outputDir, credencial.papel);

  await login(page, baseUrl, credencial);
  await verificarSemErroVisivel(page, outputDir, credencial.papel, "/dashboard");

  await page.goto(`${baseUrl}/horario`);
  await verificarSemErroVisivel(page, outputDir, credencial.papel, "/horario");

  await page.goto(`${baseUrl}/minhas-notas`);
  await verificarSemErroVisivel(page, outputDir, credencial.papel, "/minhas-notas");

  await page.goto(`${baseUrl}/financeiro`);
  await verificarSemErroVisivel(page, outputDir, credencial.papel, "/financeiro");

  await page.goto(`${baseUrl}/financeiro/emolumentos`);
  await verificarSemErroVisivel(page, outputDir, credencial.papel, "/financeiro/emolumentos");
}
