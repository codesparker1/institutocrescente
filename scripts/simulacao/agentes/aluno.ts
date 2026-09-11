import type { Page } from "playwright";
import { login, visitar } from "./comum";
import { instrumentarPagina } from "../anomalias";
import type { CredencialAgente } from "../db-helpers";

/**
 * O que um aluno faz num marco do ano: consultar o seu próprio estado (horário, notas, propinas)
 * — o aluno não escreve nada no sistema fora do login, é sempre leitura. As escritas do ano
 * (lançar aula/nota, agendar prova, processar pagamento/rematrícula) são dos outros 5 papéis.
 *
 * É por isso que esta raia é o LADO DE CHEGADA de quase todas as setas do painel: o aluno é quem
 * vê o efeito do que os outros papéis fizeram. Um fluxo que se parte a meio nota-se aqui — a
 * escrita aparece na raia de origem e nunca chega a esta.
 */
export async function visitarComoAluno(page: Page, baseUrl: string, credencial: CredencialAgente, outputDir: string): Promise<void> {
  instrumentarPagina(page, outputDir, credencial.papel);

  await login(page, baseUrl, credencial, outputDir);
  await visitar(page, baseUrl, credencial, outputDir, "/dashboard", { acao: "Vê a página inicial" });
  await visitar(page, baseUrl, credencial, outputDir, "/horario", { acao: "Consulta o horário" });
  await visitar(page, baseUrl, credencial, outputDir, "/minhas-notas", { acao: "Consulta as notas" });
  await visitar(page, baseUrl, credencial, outputDir, "/financeiro", { acao: "Consulta as propinas" });
  await visitar(page, baseUrl, credencial, outputDir, "/financeiro/emolumentos", { acao: "Consulta os emolumentos" });
}
