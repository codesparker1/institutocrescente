import type { Page } from "playwright";
import type { BrowserContext } from "playwright";
import { login, tentarLoginComPasswordErrada, textoDeErroVisivel, instrumentarECapturar, tentarAcao } from "./comum";
import type { CredencialAgente } from "../../db-helpers";
import type { AcaoCaotica, ResultadoAgenteCaotico } from "./comum";

interface OpcoesSecretariaCaotica {
  /** Aluno com pelo menos 2 mensalidades PENDENTE — resolvido pelo orquestrador via Prisma antes da corrida. */
  alunoDevedorId?: string;
}

/**
 * Secretária que não domina bem o sistema: erra a password antes de acertar, tenta pagar um mês
 * fora de ordem cronológica (deve ser rejeitado — togglePropinaAction já valida isto), e submete
 * duas matrículas de aluno em simultâneo com os mesmos dados (testa a corrida no numeroEstudante
 * gerado por count() em createAlunoAction).
 */
export async function agirComoSecretariaCaotica(
  context: BrowserContext,
  baseUrl: string,
  credencial: CredencialAgente,
  outputDir: string,
  opts: OpcoesSecretariaCaotica = {},
): Promise<ResultadoAgenteCaotico> {
  const page = await context.newPage();
  instrumentarECapturar(page, outputDir, credencial.papel);
  const acoes: AcaoCaotica[] = [];

  acoes.push(await tentarAcao("login com password errada", true, () => tentarLoginComPasswordErrada(page, baseUrl, credencial)));
  await login(page, baseUrl, credencial);

  if (opts.alunoDevedorId) {
    acoes.push(await tentarAcao("pagar mês fora de ordem cronológica", true, () => pagarMesForaDeOrdem(page, baseUrl, opts.alunoDevedorId!)));
  }

  acoes.push(
    await tentarAcao("duplo submit concorrente de matrícula", false, () => duploSubmitMatricula(context, baseUrl, credencial.papel, outputDir)),
  );

  await page.close();
  return { acoes };
}

async function pagarMesForaDeOrdem(page: Page, baseUrl: string, alunoId: string): Promise<AcaoCaotica> {
  await page.goto(`${baseUrl}/alunos/${alunoId}`);
  // MultasPendentes.tsx (renderizado logo a seguir, na mesma CardBody de "Situação Financeira")
  // usa exatamente o mesmo texto "Pendente" nos seus próprios chips — um getByRole solto no
  // page inteiro apanha os dois indiscriminadamente. Só PropinasMensais.tsx tem a etiqueta do
  // mês (span.w-28) em cada linha; escopar por aí evita clicar sem querer numa multa (que não
  // tem regra de cronologia nenhuma) a pensar que é uma mensalidade.
  const propinasContainer = page.locator("div", { has: page.locator("span.w-28") }).first();
  const chipsPendentes = propinasContainer.getByRole("button", { name: "Pendente" });
  const total = await chipsPendentes.count();
  if (total < 2) {
    return { label: "pagar mês fora de ordem", esperadoRejeitado: true, foiRejeitadoGraciosamente: null, detalhe: "menos de 2 meses pendentes disponíveis" };
  }
  // A lista é renderizada em ordem cronológica ascendente (PropinasMensais.tsx) — o último
  // "Pendente" é o mês mais recente; clicar nele com um mês anterior ainda pendente deve falhar.
  await chipsPendentes.last().click();
  await page.waitForTimeout(600);
  const erro = await textoDeErroVisivel(page);
  return {
    label: "pagar mês fora de ordem cronológica",
    esperadoRejeitado: true,
    foiRejeitadoGraciosamente: erro !== null,
    detalhe: erro ?? undefined,
  };
}

async function duploSubmitMatricula(context: BrowserContext, baseUrl: string, papel: string, outputDir: string): Promise<AcaoCaotica> {
  const nomeUnico = `Caos Concorrência ${Date.now()}`;
  const paginaA = await context.newPage();
  const paginaB = await context.newPage();
  instrumentarECapturar(paginaA, outputDir, papel);
  instrumentarECapturar(paginaB, outputDir, papel);

  await Promise.all([paginaA.goto(`${baseUrl}/alunos/novo`), paginaB.goto(`${baseUrl}/alunos/novo`)]);

  async function preencher(page: Page): Promise<void> {
    await page.fill("#nome", nomeUnico);
    await page.selectOption("#genero", "Feminino");
  }
  await Promise.all([preencher(paginaA), preencher(paginaB)]);

  const submeter = (page: Page) => page.click('button[type="submit"]:has-text("Guardar aluno")').catch(() => undefined);
  await Promise.all([submeter(paginaA), submeter(paginaB)]);
  await Promise.all([paginaA.waitForTimeout(1500), paginaB.waitForTimeout(1500)]);

  async function numeroCriado(page: Page): Promise<string | null> {
    const texto = page.locator("text=/Nº de estudante:/");
    if ((await texto.count()) === 0) return null;
    return (await texto.textContent())?.replace("Nº de estudante:", "").trim() ?? null;
  }
  const [numeroA, numeroB] = await Promise.all([numeroCriado(paginaA), numeroCriado(paginaB)]);
  await paginaA.close();
  await paginaB.close();

  const ambosCriados = numeroA !== null && numeroB !== null;
  const colidiram = ambosCriados && numeroA === numeroB;

  return {
    label: "duplo submit concorrente de matrícula (mesmo nome, dois separadores)",
    esperadoRejeitado: false,
    foiRejeitadoGraciosamente: !colidiram,
    detalhe: colidiram
      ? `COLISÃO: ambos geraram numeroEstudante=${numeroA}`
      : `numeroA=${numeroA ?? "falhou"} numeroB=${numeroB ?? "falhou"}`,
  };
}
