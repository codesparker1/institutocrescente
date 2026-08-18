import type { Page } from "playwright";
import { login } from "./comum";
import { instrumentarPagina, registarAnomalia } from "../anomalias";
import type { CredencialAgente } from "../db-helpers";

/**
 * Vai a uma disciplina do professor. `anoLetivo`, quando dado, filtra a linha de /professor por
 * esse ano (a coluna "Ano Letivo", corrigida depois de a simulação apanhar duas linhas idênticas
 * na tabela — um professor a lecionar a mesma disciplina em turmas de anos letivos diferentes,
 * ex. repetição/rematrícula da Fase 8b, e a ordem entre elas não era determinística).
 */
async function abrirDisciplina(page: Page, baseUrl: string, disciplinaLabel?: string, anoLetivo?: number): Promise<boolean> {
  await page.goto(`${baseUrl}/professor`);
  const linha = disciplinaLabel
    ? page.locator("table tbody tr", { hasText: disciplinaLabel })
    : anoLetivo
      ? page.locator("table tbody tr", { hasText: String(anoLetivo) })
      : page.locator("table tbody tr");
  const alvo = linha.first().locator("a").first();
  if ((await alvo.count()) === 0) return false;
  await Promise.all([page.waitForURL(/\/professor\/.+/, { timeout: 90000 }), alvo.click()]);
  return true;
}

/**
 * Lança nota em toda célula ainda editável (prazo aberto, sem nota já lançada por outra época que
 * não seja esta) de todas as linhas da pauta atual — não só a primeira. Sem seletor estável no
 * GradeCell (não tem id/name), por isso a busca é estrutural: todas as `tr` do corpo da tabela,
 * todos os `input[type=number]` não desativados dentro de cada uma.
 */
async function lancarTodasAsNotasDisponiveis(page: Page, outputDir: string, papel: string, valor = "15"): Promise<number> {
  const linhas = page.locator("table tbody tr");
  const totalLinhas = await linhas.count();
  let lancadas = 0;

  for (let l = 0; l < totalLinhas; l += 1) {
    const linha = linhas.nth(l);
    const celulas = linha.locator('input[type="number"]');
    const totalCelulas = await celulas.count();
    for (let c = 0; c < totalCelulas; c += 1) {
      const celula = celulas.nth(c);
      if (await celula.isDisabled()) continue;
      const valorAtual = await celula.inputValue();
      if (valorAtual !== "") continue; // já tem nota — não sobrescrever notas de outros marcos
      await celula.fill(valor);
      await celula.blur();
      await page.waitForTimeout(200); // useTransition do GradeCell precisa de assentar antes da próxima
      lancadas += 1;
    }
  }
  if (lancadas === 0) {
    console.log(`[${papel}] sem células editáveis nesta disciplina neste marco.`);
  }
  return lancadas;
}

/** Cria a aula de hoje (só existe o botão se hoje for dia letivo desta disciplina e ainda não houver aula hoje). */
async function criarAulaSeForDiaLetivo(page: Page, papel: string): Promise<boolean> {
  const botao = page.getByRole("button", { name: /Adicionar aula de hoje/ });
  if ((await botao.count()) === 0) {
    console.log(`[${papel}] hoje não é dia letivo desta disciplina, ou a aula de hoje já existe.`);
    return false;
  }
  await botao.click();
  await page.waitForLoadState("networkidle");
  return true;
}

/**
 * Alterna presença dos primeiros N alunos da aula mais recente. Na página do professor
 * (TurmaGradebook), os únicos `button type="button"` DENTRO DO CONTEÚDO são os AttendanceChip
 * — mas Topbar.tsx também tem um `button type="button"` global (o menu "Abrir menu", móvel,
 * `md:hidden`) que um seletor sem escopo à página inteira apanha também. Como esse botão fica
 * permanentemente invisível no viewport desktop do CI, o Playwright ficava à espera dele ficar
 * visível até estourar os 90s de timeout — o erro real por trás de todas as falhas "professor"
 * nesta simulação, nada a ver com professores sem disciplina atribuída (achado confirmado só
 * depois de parar de adivinhar e passar a capturar a mensagem de erro real).
 */
async function marcarPresencas(page: Page, quantidade = 3): Promise<number> {
  const chips = page.locator('main button[type="button"]');
  const total = Math.min(quantidade, await chips.count());
  for (let i = 0; i < total; i += 1) {
    await chips.nth(i).click();
    await page.waitForTimeout(150);
  }
  return total;
}

export interface ResultadoProfessor {
  disciplinaAberta: boolean;
  notasLancadas: number;
  aulaCriada: boolean;
  presencasMarcadas: number;
}

/**
 * O que um professor faz num marco do ano: abrir uma disciplina, lançar todas as notas que o
 * prazo ainda permitir, criar a aula de hoje se for dia letivo, e marcar presença de alguns alunos.
 */
export async function agirComoProfessor(
  page: Page,
  baseUrl: string,
  credencial: CredencialAgente,
  outputDir: string,
  opts: { disciplinaLabel?: string; anoLetivo?: number; valor?: string; jaLogado?: boolean } = {},
): Promise<ResultadoProfessor> {
  if (!opts.jaLogado) {
    instrumentarPagina(page, outputDir, credencial.papel);
    await login(page, baseUrl, credencial);
  }

  const disciplinaAberta = await abrirDisciplina(page, baseUrl, opts.disciplinaLabel, opts.anoLetivo);
  if (!disciplinaAberta) {
    await registarAnomalia(page, outputDir, credencial.papel, "/professor sem nenhuma disciplina atribuída");
    return { disciplinaAberta: false, notasLancadas: 0, aulaCriada: false, presencasMarcadas: 0 };
  }

  const linhaExiste = (await page.locator("table tbody tr").count()) > 0;
  if (!linhaExiste) {
    await registarAnomalia(page, outputDir, credencial.papel, "pauta sem alunos/avaliações — tabela vazia");
    return { disciplinaAberta: true, notasLancadas: 0, aulaCriada: false, presencasMarcadas: 0 };
  }

  const notasLancadas = await lancarTodasAsNotasDisponiveis(page, outputDir, credencial.papel, opts.valor);
  const aulaCriada = await criarAulaSeForDiaLetivo(page, credencial.papel);
  const presencasMarcadas = aulaCriada || (await page.locator("text=presentes").count()) > 0 ? await marcarPresencas(page) : 0;

  return { disciplinaAberta, notasLancadas, aulaCriada, presencasMarcadas };
}
