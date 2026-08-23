/**
 * Ações UI reutilizadas por vários cenários — confirmar propina (Registo de Pagamentos), lançar
 * nota na pauta do professor, e processar rematrícula (RematriculaForm). Cada uma dirige a Server
 * Action real via Playwright, nunca escreve na BD diretamente (ver src/actions/*).
 */
import type { Browser, Page } from "playwright";
import { login } from "../agentes/comum";
import { instrumentarPagina, registarAnomalia } from "../anomalias";
import type { CredencialAgente } from "../db-helpers";

/**
 * Confirma a propina PENDENTE mais antiga do aluno via /financeiro/registo. Reproduz a regra de
 * confirmarPagamentosEmLoteAction (src/actions/financeiro.ts): tem de incluir no lote TODOS os
 * meses pendentes até (e incluindo) o mês mais recente selecionado — por isso marca as checkboxes
 * de TODAS as PROPINA pendentes visíveis até à data, não só uma. A multa do mesmo mês entra
 * automaticamente no lado do servidor (junta-se sempre, exceto semMulta=true, só ADMIN).
 */
export async function confirmarPropinaMaisAntiga(
  page: Page,
  baseUrl: string,
  staffCredencial: CredencialAgente,
  alunoNome: string,
  outputDir: string,
  opts: { jaLogado?: boolean } = {},
): Promise<boolean> {
  if (!opts.jaLogado) {
    instrumentarPagina(page, outputDir, staffCredencial.papel);
    await login(page, baseUrl, staffCredencial);
  }

  await page.goto(`${baseUrl}/financeiro/registo`);
  await page.fill("#busca-registo-pagamentos", alunoNome);
  // RegistoPagamentosBusca.tsx faz debounce de 300ms antes de sequer chamar searchAlunosAction
  // (mais o round-trip do próprio server action) — sem esperar pelo resultado aparecer, o count()
  // corre sempre antes da lista ser preenchida e falha 100% das vezes, mesmo com o aluno seedado.
  const linhaResultado = page.locator("button", { hasText: alunoNome }).first();
  try {
    await linhaResultado.waitFor({ state: "visible", timeout: 5000 });
  } catch {
    await registarAnomalia(page, outputDir, staffCredencial.papel, `${alunoNome} não encontrado na busca de /financeiro/registo`);
    return false;
  }
  await linhaResultado.click();
  await page.waitForTimeout(500);

  // PagamentosSecretariaPanel/PropinasMensais: cada mensalidade PENDENTE tem uma checkbox "Selecionar"
  // (estado só no cliente, sem name= — o POST real é montado em JS a partir do Set selecionado, ver
  // handleConfirmar em PagamentosSecretariaPanel.tsx). Marca TODAS as pendentes visíveis — replica
  // "incluir todos os meses pendentes até ao mais recente" exigido por confirmarPagamentosEmLoteAction.
  const secaoPropinas = page.locator('[data-secao="propinas-mensais"]');
  const checkboxesPropina = secaoPropinas.locator('input[type="checkbox"]');
  const total = await checkboxesPropina.count();
  if (total === 0) {
    // Sem nada pendente — já está tudo pago, não é uma falha do cenário.
    return true;
  }
  for (let i = 0; i < total; i += 1) {
    const caixa = checkboxesPropina.nth(i);
    if (!(await caixa.isChecked())) await caixa.check();
  }

  const botaoConfirmar = page.getByRole("button", { name: /Confirmar e emitir recibo/i });
  if ((await botaoConfirmar.count()) === 0) {
    await registarAnomalia(page, outputDir, staffCredencial.papel, `botão de confirmar pagamento não encontrado para ${alunoNome}`);
    return false;
  }
  await botaoConfirmar.first().click();
  await page.waitForTimeout(800);
  return true;
}

/** Lança uma nota (época P1/P2/EXAME/...) para um aluno específico na pauta já aberta. */
export async function lancarNotaAluno(page: Page, alunoNome: string, colunaIndex: number, valor: number): Promise<boolean> {
  const linha = page.locator("tbody tr", { hasText: alunoNome });
  if ((await linha.count()) === 0) return false;
  const input = linha.locator('input[type="number"]').nth(colunaIndex);
  if ((await input.count()) === 0 || (await input.isDisabled())) return false;
  await input.fill(String(valor));
  await input.blur();
  await new Promise((resolve) => setTimeout(resolve, 300));
  return true;
}

/** Clica "Guardar alterações" na pauta (GradebookEditor) depois de preencher as células desejadas. */
export async function guardarNotasPauta(page: Page): Promise<void> {
  const botao = page.getByRole("button", { name: /Guardar alterações/i });
  if ((await botao.count()) === 0) return;
  if (await botao.isDisabled()) return;
  await botao.click();
  await page.waitForTimeout(800);
}

/**
 * Abre TODAS as disciplinas do professor (percorre a tabela /professor linha a linha) e, em cada
 * uma, chama `porDisciplina` com a Page já posicionada na pauta — usado para lançar a mesma época
 * de nota num aluno em ambas as cadeiras seedadas (Programação I, Bases de Dados) sem repetir o
 * padrão de navegação em cada ficheiro de cenário.
 */
export async function paraCadaDisciplinaDoProfessor(
  browser: Browser,
  baseUrl: string,
  professorCredencial: CredencialAgente,
  outputDir: string,
  porDisciplina: (page: Page) => Promise<void>,
): Promise<void> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  instrumentarPagina(page, outputDir, professorCredencial.papel);
  await login(page, baseUrl, professorCredencial);
  await page.goto(`${baseUrl}/professor`);

  const totalLinhas = await page.locator("table tbody tr").count();
  for (let i = 0; i < totalLinhas; i += 1) {
    await page.goto(`${baseUrl}/professor`);
    const link = page.locator("table tbody tr").nth(i).locator("a").first();
    if ((await link.count()) === 0) continue;
    await Promise.all([page.waitForURL(/\/professor\/.+/, { timeout: 90000 }), link.click()]);
    await porDisciplina(page);
  }
  await ctx.close();
}

export interface ResultadoRematricula {
  sucesso: boolean;
  erro: string | null;
  resultado: string | null;
}

/**
 * Processa a rematrícula de um aluno via RematriculaForm (/alunos/[id]). `staffCredencial` deve
 * ser ADMIN quando `foraDaJanela` (só ADMIN tem podeForaDaJanela=true — ver RematriculaForm.tsx).
 */
export async function processarRematricula(
  page: Page,
  baseUrl: string,
  staffCredencial: CredencialAgente,
  alunoId: string,
  outputDir: string,
  opts: { jaLogado?: boolean } = {},
): Promise<ResultadoRematricula> {
  if (!opts.jaLogado) {
    instrumentarPagina(page, outputDir, staffCredencial.papel);
    await login(page, baseUrl, staffCredencial);
  }

  await page.goto(`${baseUrl}/alunos/${alunoId}`);
  const botao = page.getByRole("button", { name: /Processar Rematrícula/i });
  if ((await botao.count()) === 0) {
    // RematriculaForm não renderiza nenhum botão quando fora da janela e sem podeForaDaJanela —
    // não é uma falha de infraestrutura, é o próprio guarda de UI a funcionar.
    return { sucesso: false, erro: "Fora da janela e sem permissão para rematrícula tardia (formulário sem botão).", resultado: null };
  }
  await botao.click();
  await page.waitForTimeout(1000);

  const mensagemErro = page.locator("p.text-red-600");
  const mensagemResultado = page.locator("p.text-green-700");
  const erro = (await mensagemErro.count()) > 0 ? (await mensagemErro.first().textContent())?.trim() ?? null : null;
  const resultado = (await mensagemResultado.count()) > 0 ? (await mensagemResultado.first().textContent())?.trim() ?? null : null;

  return { sucesso: erro === null, erro, resultado };
}
