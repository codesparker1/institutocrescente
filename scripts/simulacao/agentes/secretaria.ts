import type { Page } from "playwright";
import { login, visitar } from "./comum";
import { instrumentarPagina } from "../anomalias";
import type { CredencialAgente } from "../db-helpers";

/** Fatia mínima de validação — navegação pelas páginas-chave do papel, sem escrever ainda. */
export async function visitarComoSecretaria(page: Page, baseUrl: string, credencial: CredencialAgente, outputDir: string): Promise<void> {
  instrumentarPagina(page, outputDir, credencial.papel);

  await login(page, baseUrl, credencial, outputDir);
  await visitar(page, baseUrl, credencial, outputDir, "/dashboard", { acao: "Vê a página inicial" });
  await visitar(page, baseUrl, credencial, outputDir, "/alunos", { acao: "Abre a lista de alunos" });
  await visitar(page, baseUrl, credencial, outputDir, "/financeiro/registo", { acao: "Abre o registo de pagamentos" });
  await visitar(page, baseUrl, credencial, outputDir, "/financeiro/devedores", { acao: "Consulta os devedores" });
}
