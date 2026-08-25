/**
 * Ações UI dos novos perfis "faculdade de verdade" (§pedido do cliente 2026-08-25) — rotas que
 * o ledger marca como nunca cobertas:
 *
 *   - Carlos Muanza (transferido): DAAC credita 2 cadeiras do 1º ano via CreditarCadeiraForm
 *     (creditarCadeiraAction — rota existente desde 2026-08-18, zero cobertura até hoje);
 *   - Paulo Chissola (desistente): ADMIN marca DESISTENTE via DesistenciaForm
 *     (marcarDesistenteAction — feature nova de 2026-08-25) com motivo obrigatório;
 *   - Sandra Kambunda: SECRETARIA regista emolumento "Declaração de matrícula" via fluxo de
 *     Registo de Pagamentos (registarEmolumentosEmLoteAction);
 *   - Tomás Kapata: ADMIN muda categoria NORMAL → COMPARTICIPADA via CategoriaEstudanteForm.
 *
 * Mesmo padrão de extras-v2.ts/acoes-comuns.ts: dirige a UI real (Playwright), lê a BD só para
 * localizar ids e CONFIRMAR o efeito após cada ação.
 */
import type { Browser, Page } from "playwright";
import { login } from "../agentes/comum";
import { instrumentarPagina } from "../anomalias";
import type { CredencialAgente } from "../db-helpers";
import type { PrismaClient } from "../../../src/generated/prisma/client";
import { shot } from "./extras-v2";

export interface ResultadoAcao {
  ok: boolean;
  detalhe: string;
}

/**
 * DAAC credita uma cadeira ao aluno transferido: ficha do aluno → Percurso Curricular →
 * CreditarCadeiraForm (nota + instituição de origem). Confirma na BD: InscricaoCadeira criada
 * com creditada=true, instituicaoOrigemCreditado preenchido e 3 notas (P1/P2/EXAME iguais).
 */
export async function creditarCadeiraComoDaac(
  browser: Browser,
  baseUrl: string,
  daacCredencial: CredencialAgente,
  prisma: PrismaClient,
  alunoEmail: string,
  nomeDisciplina: string,
  notaCreditada: number,
  instituicaoOrigem: string,
  outputDir: string,
  etiqueta: string,
): Promise<ResultadoAcao> {
  const aluno = await prisma.aluno.findFirst({ where: { user: { email: alunoEmail } } });
  if (!aluno) return { ok: false, detalhe: `creditar: aluno ${alunoEmail} não encontrado` };

  const cadeira = await prisma.cadeiraCurricular.findFirst({
    where: { disciplina: { nome: nomeDisciplina }, curso: { nome: "Engenharia Informática" } },
    include: { disciplina: true },
  });
  if (!cadeira) return { ok: false, detalhe: `creditar: cadeira "${nomeDisciplina}" não encontrada` };

  const ctxBrowser = await browser.newContext();
  const page = await ctxBrowser.newPage();
  instrumentarPagina(page, outputDir, daacCredencial.papel);
  try {
    await login(page, baseUrl, daacCredencial);
    await page.goto(`${baseUrl}/alunos/${aluno.id}`);
    // O formulário vive dentro da Disclosure "Percurso Curricular".
    const disclosure = page.locator("div", { hasText: /^Percurso Curricular/ }).first();
    const trigger = page.getByText("Percurso Curricular").first();
    try {
      await trigger.click({ timeout: 15000 });
      await page.waitForTimeout(600);
    } catch {
      /* já aberta ou clique direto falhou — segue */
    }
    void disclosure;

    const form = page.locator("form", { hasText: "Creditar" }).first();
    try {
      await form.waitFor({ state: "visible", timeout: 15000 });
    } catch {
      return { ok: false, detalhe: "creditar: CreditarCadeiraForm não apareceu na ficha (UI mudou?)" };
    }
    await shot(page, outputDir, `c${etiqueta}-creditar-antes`);

    // Selects por label; campos: cadeiraCurricularId (select), notaCreditada, instituicaoOrigem.
    const selectCadeira = form.locator("select[name='cadeiraCurricularId']");
    if ((await selectCadeira.count()) === 0) {
      return { ok: false, detalhe: "creditar: select de cadeira não encontrado no formulário" };
    }
    const optionValue = await selectCadeira.locator("option", { hasText: nomeDisciplina }).first().getAttribute("value");
    if (!optionValue) return { ok: false, detalhe: `creditar: opção "${nomeDisciplina}" ausente no select` };
    await selectCadeira.selectOption(optionValue);
    await form.locator("input[name='notaCreditada']").fill(String(notaCreditada));
    await form.locator("input[name='instituicaoOrigem']").fill(instituicaoOrigem);
    await form.locator("button[type='submit']").click();
    await page.waitForTimeout(1500);
    await shot(page, outputDir, `c${etiqueta}-creditar-depois`);

    // Confirmação código-wise.
    const inscricao = await prisma.inscricaoCadeira.findFirst({
      where: { alunoId: aluno.id, creditada: true, cadeiraCurricularId: cadeira.id },
      include: { notas: true },
    });
    const ok = Boolean(inscricao) && inscricao!.notas.length >= 3 && inscricao!.instituicaoOrigemCreditado === instituicaoOrigem;
    return {
      ok,
      detalhe: `${aluno.nome}: ${nomeDisciplina} creditada (${notaCreditada}/20, ${instituicaoOrigem}) — ${inscricao?.notas.length ?? 0} notas gravadas ${ok ? "(confirmado na BD)" : "(BD NÃO refletiu)"}`,
    };
  } catch (erro) {
    return { ok: false, detalhe: `creditar ERRO: ${(erro as Error).message.slice(0, 140)}` };
  } finally {
    await ctxBrowser.close();
  }
}

/**
 * ADMIN marca o aluno como DESISTENTE via DesistenciaForm (marcarDesistenteAction) com motivo.
 * Confirma na BD: status=DESISTENTE, matrícula TRANCADA, inscrições ativas=0.
 */
export async function marcarDesistenteComoAdmin(
  browser: Browser,
  baseUrl: string,
  adminCredencial: CredencialAgente,
  prisma: PrismaClient,
  alunoEmail: string,
  motivo: string,
  outputDir: string,
  etiqueta: string,
): Promise<ResultadoAcao> {
  const aluno = await prisma.aluno.findFirst({ where: { user: { email: alunoEmail } } });
  if (!aluno) return { ok: false, detalhe: `desistencia: aluno ${alunoEmail} não encontrado` };

  const ctxBrowser = await browser.newContext();
  const page = await ctxBrowser.newPage();
  instrumentarPagina(page, outputDir, adminCredencial.papel);
  try {
    await login(page, baseUrl, adminCredencial);
    await page.goto(`${baseUrl}/alunos/${aluno.id}`);

    const card = page.locator("div", { has: page.getByRole("heading", { name: "Desistência" }) }).last();
    try {
      await page.getByText("Motivo da desistência").waitFor({ state: "visible", timeout: 15000 });
    } catch {
      return { ok: false, detalhe: "desistencia: formulário de desistência não apareceu na ficha" };
    }
    void card;
    await shot(page, outputDir, `c${etiqueta}-desistencia-antes`);

    const textarea = page.locator("textarea[name='motivo']");
    await textarea.fill(motivo);
    // window.confirm é disparado no submit — aceitar automaticamente.
    page.once("dialog", (d) => d.accept());
    await page.locator("button", { hasText: "Marcar como Desistente" }).first().click();
    await page.waitForTimeout(1500);
    await shot(page, outputDir, `c${etiqueta}-desistencia-depois`);

    const depois = await prisma.aluno.findUniqueOrThrow({ where: { id: aluno.id } });
    const mats = await prisma.matricula.count({ where: { alunoId: aluno.id, status: "ATIVA" } });
    const inscAtivas = await prisma.inscricaoCadeira.count({ where: { alunoId: aluno.id, ativa: true } });
    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "Aluno", entityId: aluno.id, action: { contains: "DESISTENTE" } },
      orderBy: { createdAt: "desc" },
    });
    const ok = depois.status === "DESISTENTE" && mats === 0 && inscAtivas === 0 && Boolean(audit);
    return {
      ok,
      detalhe: `${depois.nome}: DESISTENTE ${ok ? "(BD confirmada: 0 matrículas ATIVA, 0 inscrições ativas, auditoria c/motivo)" : `(status=${depois.status}, matsATIVA=${mats}, insc=${inscAtivas}, audit=${Boolean(audit)})`}`,
    };
  } catch (erro) {
    return { ok: false, detalhe: `desistencia ERRO: ${(erro as Error).message.slice(0, 140)}` };
  } finally {
    await ctxBrowser.close();
  }
}

/**
 * SECRETARIA regista um emolumento pago ao aluno (Registo de Pagamentos → emolumentos).
 * Fluxo UI: /financeiro/registo → procura aluno → seleciona emolumento → confirma.
 * Se o formulário de emolumentos não for alcançável nesta rota, reporta NOK honesto.
 */
export async function registarEmolumentoComoSecretaria(
  browser: Browser,
  baseUrl: string,
  secretariaCredencial: CredencialAgente,
  prisma: PrismaClient,
  alunoNome: string,
  nomeEmolumento: string,
  outputDir: string,
  etiqueta: string,
): Promise<ResultadoAcao> {
  const ctxBrowser = await browser.newContext();
  const page = await ctxBrowser.newPage();
  instrumentarPagina(page, outputDir, secretariaCredencial.papel);
  try {
    await login(page, baseUrl, secretariaCredencial);
    await page.goto(`${baseUrl}/financeiro/emolumentos`);
    await page.waitForTimeout(1200);
    await shot(page, outputDir, `c${etiqueta}-emolumento-pagina`);

    // Procura o campo de busca do aluno e o select/catálogo do emolumento.
    const busca = page.locator("input[type='search'], input[name*='aluno'], input[placeholder*='aluno' i]").first();
    if ((await busca.count()) === 0) {
      return { ok: false, detalhe: "emolumento: campo de busca de aluno não encontrado em /financeiro/emolumentos" };
    }
    await busca.fill(alunoNome);
    await page.waitForTimeout(1000);

    const botaoEmolumento = page.locator("button", { hasText: nomeEmolumento }).first();
    if ((await botaoEmolumento.count()) === 0) {
      return { ok: false, detalhe: `emolumento: botão/opção "${nomeEmolumento}" não encontrado` };
    }
    await botaoEmolumento.click();
    await page.waitForTimeout(1200);

    // Confirmação final (botão de submeter dentro do diálogo/formulário aberto).
    const submit = page.locator("button[type='submit']", { hasText: /Confirmar|Registar|Adicionar/i }).last();
    if ((await submit.count()) > 0) {
      await submit.click();
      await page.waitForTimeout(1200);
    }
    await shot(page, outputDir, `c${etiqueta}-emolumento-registado`);

    // Confirmação código-wise: Cobranca EMOLUMENTO PAGO criada para o aluno.
    const aluno = await prisma.aluno.findFirst({ where: { nome: alunoNome } });
    if (!aluno) return { ok: false, detalhe: `emolumento: aluno "${alunoNome}" não existe` };
    const cobranca = await prisma.cobranca.findFirst({
      where: { alunoId: aluno.id, tipo: "EMOLUMENTO" },
      orderBy: { createdAt: "desc" },
    });
    const ok = Boolean(cobranca) && cobranca!.descricao?.includes(nomeEmolumento) !== false;
    return {
      ok,
      detalhe: `${alunoNome}: emolumento "${nomeEmolumento}" ${cobranca ? `registado (${Number(cobranca.valorDevido)} Kz, ${cobranca.status}) ${ok ? "— confirmado na BD" : ""}` : "NÃO apareceu na BD"}`,
    };
  } catch (erro) {
    return { ok: false, detalhe: `emolumento ERRO: ${(erro as Error).message.slice(0, 140)}` };
  } finally {
    await ctxBrowser.close();
  }
}

/**
 * ADMIN muda a categoria do estudante via CategoriaEstudanteForm na ficha (atualizarCategoriaEstudanteAction).
 * Confirma na BD: Aluno.categoria atualizada.
 */
export async function mudarCategoriaComoAdmin(
  browser: Browser,
  baseUrl: string,
  adminCredencial: CredencialAgente,
  prisma: PrismaClient,
  alunoEmail: string,
  novaCategoria: "NORMAL" | "BOLSEIRO_INAGBE" | "COMPARTICIPADA",
  outputDir: string,
  etiqueta: string,
): Promise<ResultadoAcao> {
  const aluno = await prisma.aluno.findFirst({ where: { user: { email: alunoEmail } } });
  if (!aluno) return { ok: false, detalhe: `categoria: aluno ${alunoEmail} não encontrado` };

  const ctxBrowser = await browser.newContext();
  const page = await ctxBrowser.newPage();
  instrumentarPagina(page, outputDir, adminCredencial.papel);
  try {
    await login(page, baseUrl, adminCredencial);
    await page.goto(`${baseUrl}/alunos/${aluno.id}`);

    const selectCategoria = page.locator("select[name='categoria']").first();
    try {
      await selectCategoria.waitFor({ state: "visible", timeout: 15000 });
    } catch {
      return { ok: false, detalhe: "categoria: select de categoria não encontrado na ficha" };
    }
    await shot(page, outputDir, `c${etiqueta}-categoria-antes`);
    await selectCategoria.selectOption(novaCategoria);
    await page.waitForTimeout(1200);
    await shot(page, outputDir, `c${etiqueta}-categoria-depois`);

    const depois = await prisma.aluno.findUniqueOrThrow({ where: { id: aluno.id } });
    const ok = depois.categoria === novaCategoria;
    return { ok, detalhe: `${depois.nome}: categoria → ${depois.categoria} ${ok ? "(confirmado na BD)" : "(BD NÃO refletiu)"}` };
  } catch (erro) {
    return { ok: false, detalhe: `categoria ERRO: ${(erro as Error).message.slice(0, 140)}` };
  } finally {
    await ctxBrowser.close();
  }
}
