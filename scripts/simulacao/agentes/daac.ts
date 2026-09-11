import type { Page } from "playwright";
import { login, visitar, anomaliaDoAgente } from "./comum";
import { instrumentarPagina } from "../anomalias";
import type { CredencialAgente } from "../db-helpers";

/**
 * Fatia mínima de validação — navegação pelas páginas-chave do papel, sem escrever ainda.
 * Prova de caminho, também, que o split fino do middleware (Fase 10) deixa o DAAC entrar em
 * /admin/curriculo mas continua a barrar /admin/professores.
 */
export async function visitarComoDaac(page: Page, baseUrl: string, credencial: CredencialAgente, outputDir: string): Promise<void> {
  instrumentarPagina(page, outputDir, credencial.papel);

  await login(page, baseUrl, credencial, outputDir);
  await visitar(page, baseUrl, credencial, outputDir, "/dashboard", { acao: "Vê a página inicial" });
  await visitar(page, baseUrl, credencial, outputDir, "/admin/curriculo", { acao: "Abre o plano curricular" });
  await visitar(page, baseUrl, credencial, outputDir, "/admin/academico/configuracao", { acao: "Abre a configuração académica" });
  await visitar(page, baseUrl, credencial, outputDir, "/notas", { acao: "Abre as pautas" });

  // Confirma o gate: DAAC não deve conseguir ver /admin/professores (só ADMIN — middleware.ts).
  // Não passa por `visitar` de propósito: o esperado aqui é um redireccionamento, e registar a
  // visita como normal poria no painel um acesso que não devia ter acontecido.
  await page.goto(`${baseUrl}/admin/professores`);
  await page.waitForURL(/\/dashboard/).catch(async () => {
    await anomaliaDoAgente(page, credencial, outputDir, "DAAC conseguiu aceder a /admin/professores — devia ter sido redirecionado");
  });
}
