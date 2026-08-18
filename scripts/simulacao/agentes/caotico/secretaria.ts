import type { Page } from "playwright";
import type { BrowserContext } from "playwright";
import { login, tentarLoginComPasswordErrada, textoDeErroVisivel, instrumentarECapturar, tentarAcao } from "./comum";
import type { CredencialAgente } from "../../db-helpers";
import type { AcaoCaotica, ResultadoAgenteCaotico } from "./comum";

interface OpcoesSecretariaCaotica {
  /** Aluno com pelo menos 2 mensalidades PENDENTE — resolvido pelo orquestrador via Prisma antes da corrida. */
  alunoDevedorId?: string;
  /** Aluno FORA da janela de matrícula corrente — resolvido pelo orquestrador antes da corrida. */
  alunoForaDaJanelaId?: string;
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

  if (opts.alunoForaDaJanelaId) {
    acoes.push(
      await tentarAcao("processar rematrícula fora da janela configurada", true, () =>
        tentarRematriculaForaDaJanela(page, baseUrl, opts.alunoForaDaJanelaId!),
      ),
    );
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
  // page inteiro apanha os dois indiscriminadamente. data-secao é um marcador só para testes,
  // adicionado de propósito a PropinasMensais.tsx — mais fiável do que tentar adivinhar a
  // hierarquia certa por classes CSS partilhadas (has()+.first() apanha o ancestral errado).
  const propinasContainer = page.locator('[data-secao="propinas-mensais"]');
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

/**
 * Achado do cost-meter: este cenário corria antes com uma sessão DAAC e reportava sempre "botão
 * presente inesperadamente" — mas a secção de Rematrícula é gated por podeRegistarPagamento
 * (ADMIN/SECRETARIA só, ver src/lib/permissions.ts), nunca renderiza para DAAC. O teste não
 * estava a apanhar um bug da app, estava a testar o papel errado — nem o botão nem o aviso de
 * "fora da janela" existiam no DOM, e a lógica binária antiga não distinguia isso de um crash
 * real. Corrigido para secretaria (acesso genuíno) com uma asserção sem ambiguidade: confirma
 * que a secção EXISTE (senão o teste não está a verificar nada) e que dentro dela o aviso
 * aparece e o botão não. RematriculaForm nunca renderiza o botão de submit quando fora da
 * janela (dentroDaJanela vem computado no servidor) — não há botão real para clicar e confirmar
 * a rejeição do servidor; a ausência do próprio controlo já É o "falhar fechado" correto.
 */
async function tentarRematriculaForaDaJanela(page: Page, baseUrl: string, alunoId: string): Promise<AcaoCaotica> {
  await page.goto(`${baseUrl}/alunos/${alunoId}`);
  const seccaoExiste = (await page.getByText("Rematrícula", { exact: true }).count()) > 0;
  if (!seccaoExiste) {
    return {
      label: "processar rematrícula fora da janela configurada",
      esperadoRejeitado: true,
      foiRejeitadoGraciosamente: null,
      detalhe: "secção de Rematrícula não encontrada para este papel — teste não é conclusivo",
    };
  }
  const botao = page.getByRole("button", { name: "Processar Rematrícula" });
  const aviso = page.getByText("Fora do período de matrícula", { exact: false });
  const botaoAusente = (await botao.count()) === 0;
  const avisoPresente = (await aviso.count()) > 0;
  return {
    label: "processar rematrícula fora da janela configurada",
    esperadoRejeitado: true,
    foiRejeitadoGraciosamente: botaoAusente && avisoPresente,
    detalhe: `botaoAusente=${botaoAusente} avisoPresente=${avisoPresente}`,
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
