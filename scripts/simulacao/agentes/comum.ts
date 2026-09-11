import type { Page } from "playwright";
import { DEMO_PASSWORD, type CredencialAgente } from "../db-helpers";
import { registarAnomalia } from "../anomalias";
import { registarEventoAgente } from "../telemetria";

/**
 * Peças partilhadas por todos os agentes calmos.
 *
 * `visitar` e `registarAcao` são o ponto único de instrumentação do painel de simulação
 * (§pedido do cliente 2026-09-11): cada navegação e cada escrita passam a deixar um SimEvento com
 * a raia, a entidade tocada e a duração. Duas fontes, mesmo desenho de anomalias.ts — passiva
 * (a navegação regista-se sozinha) e ativa (o agente declara o que escreveu).
 *
 * Antes disto, `verificarSemErroVisivel` e a lista de marcadores estavam copiadas em cada ficheiro
 * de agente. Passar a instrumentação por aqui só funciona se houver um `aqui` — daí a
 * consolidação.
 */

const TEXTO_ERRO_INESPERADO = ["application error", "internal server error", "something went wrong"];

/**
 * Erro renderizado na página — o que um screenshot mostraria mas um status 200 esconde. Devolve o
 * marcador encontrado (ou null) para o chamador o poder anexar ao evento de telemetria, em vez de
 * a anomalia viver só no ficheiro de anomalias, longe da linha temporal onde aconteceu.
 */
async function erroVisivel(page: Page, outputDir: string, papel: string, onde: string): Promise<string | null> {
  const texto = (await page.textContent("body"))?.toLowerCase() ?? "";
  const encontrado = TEXTO_ERRO_INESPERADO.find((marcador) => texto.includes(marcador));
  if (!encontrado) return null;
  await registarAnomalia(page, outputDir, papel, `texto de erro ("${encontrado}") visível em ${onde}`);
  return encontrado;
}

/** Mesmos seletores/fluxo de scripts/e2e-workflow/run.ts — id="identificador"/"password" (LoginForm.tsx). */
export async function login(page: Page, baseUrl: string, credencial: CredencialAgente, outputDir?: string): Promise<void> {
  const inicio = Date.now();
  await page.goto(`${baseUrl}/login`);
  await page.fill("#identificador", credencial.email);
  await page.fill("#password", DEMO_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/(dashboard|professor)/),
    page.click('button[type="submit"]'),
  ]);

  // outputDir opcional para não partir chamadores antigos — sem ele o login não entra no painel,
  // que é o comportamento correto: sem corrida a que pertencer, o evento não tem onde ser lido.
  if (!outputDir) return;
  await registarEventoAgente({
    outputDir,
    papel: credencial.papel,
    acao: "Entra na sessão",
    rota: "/login",
    userId: credencial.userId,
    alunoId: credencial.alunoId,
    duracaoMs: Date.now() - inicio,
  });
}

interface OpcoesVisita {
  /**
   * Como a visita se lê no painel. Por omissão "Abre <rota>", que é honesto mas seco; um agente
   * que saiba o que foi lá ver diz melhor ("Vê a nota da defesa").
   */
  acao?: string;
  /** Entidade explícita, quando o id não está na URL. */
  entidade?: string | null;
}

/**
 * Navega, confirma que não há erro visível, e regista a visita no painel. Substitui o par
 * `page.goto` + `verificarSemErroVisivel` que estava repetido em cada agente.
 */
export async function visitar(
  page: Page,
  baseUrl: string,
  credencial: CredencialAgente,
  outputDir: string,
  rota: string,
  opcoes: OpcoesVisita = {},
): Promise<void> {
  const inicio = Date.now();
  await page.goto(`${baseUrl}${rota}`);
  const duracaoMs = Date.now() - inicio;
  const erro = await erroVisivel(page, outputDir, credencial.papel, rota);

  await registarEventoAgente({
    outputDir,
    papel: credencial.papel,
    acao: opcoes.acao ?? `Abre ${rota}`,
    rota,
    entidade: opcoes.entidade,
    userId: credencial.userId,
    alunoId: credencial.alunoId,
    duracaoMs,
    detalhes: erro ? { anomalia: `texto de erro visível: ${erro}` } : undefined,
  });
}

/**
 * Uma ESCRITA — o agente mudou estado do sistema. Separada de `visitar` porque é isto que faz um
 * fluxo começar: a seta no painel só significa alguma coisa quando de um lado houve uma mudança e
 * do outro alguém a viu.
 */
export async function registarAcao(
  credencial: CredencialAgente,
  outputDir: string,
  acao: string,
  opcoes: { entidade?: string | null; rota?: string; duracaoMs?: number; detalhes?: Record<string, unknown> } = {},
): Promise<void> {
  await registarEventoAgente({
    outputDir,
    papel: credencial.papel,
    acao,
    rota: opcoes.rota,
    entidade: opcoes.entidade,
    userId: credencial.userId,
    alunoId: credencial.alunoId,
    escrita: true,
    duracaoMs: opcoes.duracaoMs,
    detalhes: opcoes.detalhes,
  });
}

/** Anomalia notada pelo agente, com registo também na linha temporal do painel. */
export async function anomaliaDoAgente(
  page: Page,
  credencial: CredencialAgente,
  outputDir: string,
  motivo: string,
): Promise<void> {
  await registarAnomalia(page, outputDir, credencial.papel, motivo);
  await registarEventoAgente({
    outputDir,
    papel: credencial.papel,
    acao: motivo,
    userId: credencial.userId,
    alunoId: credencial.alunoId,
    detalhes: { anomalia: motivo },
  });
}
