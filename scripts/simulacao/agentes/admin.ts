import type { Page } from "playwright";
import { login, visitar } from "./comum";
import { instrumentarPagina } from "../anomalias";
import type { CredencialAgente } from "../db-helpers";

/** Fatia mínima de validação — navegação pelas páginas-chave do papel, sem escrever ainda. */
export async function visitarComoAdmin(page: Page, baseUrl: string, credencial: CredencialAgente, outputDir: string): Promise<void> {
  instrumentarPagina(page, outputDir, credencial.papel);

  await login(page, baseUrl, credencial, outputDir);
  await visitar(page, baseUrl, credencial, outputDir, "/dashboard", { acao: "Vê a página inicial" });
  await visitar(page, baseUrl, credencial, outputDir, "/admin/professores", { acao: "Abre a gestão de professores" });
  await visitar(page, baseUrl, credencial, outputDir, "/admin/financeiro/configuracao", { acao: "Abre a configuração financeira" });
  await visitar(page, baseUrl, credencial, outputDir, "/auditoria", { acao: "Consulta a auditoria" });
}
