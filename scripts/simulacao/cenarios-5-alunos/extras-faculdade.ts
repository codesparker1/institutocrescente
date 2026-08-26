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
    // O formulário vive dentro da Disclosure "Percurso Curricular" — começa FECHADA. Abrir antes
    // de procurar o formulário (clica no summary <details> nativo, sem JS).
    const trigger = page.locator("details summary", { hasText: "Percurso Curricular" }).first();
    try {
      await trigger.waitFor({ state: "visible", timeout: 15000 });
      await trigger.click();
      await page.waitForTimeout(800);
    } catch {
      /* já aberta ou clique direto falhou — segue */
    }

    // O CreditarCadeiraForm é um toggle: primeiro clica no botão "Creditar cadeira de outra
    // instituição" (é só aí que o <form> passa a existir no DOM).
    const toggleCredito = page.locator("button", { hasText: "Creditar cadeira de outra instituição" }).first();
    try {
      await toggleCredito.waitFor({ state: "visible", timeout: 15000 });
      await toggleCredito.click();
      await page.waitForTimeout(600);
    } catch {
      return { ok: false, detalhe: "creditar: botão 'Creditar cadeira de outra instituição' não apareceu (permissão DAAC? Disclosure aberta?)" };
    }

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

    // §correção 2026-08-25: o DesistenciaForm aparece para ATIVO e TRANCADO (a action aceita
    // ambos). O card "Desistência" está sempre renderizado; o formulário interno é que depende
    // do status. Procurar diretamente o textarea (é único na página).
    const textarea = page.locator("textarea[name='motivo']").first();
    try {
      await page.getByText("Desistência").last().scrollIntoViewIfNeeded();
      await textarea.waitFor({ state: "visible", timeout: 15000 });
    } catch {
      return { ok: false, detalhe: "desistencia: formulário de desistência não apareceu na ficha (status inesperado?)" };
    }
    await shot(page, outputDir, `c${etiqueta}-desistencia-antes`);

    await textarea.fill(motivo);
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
 * Fluxo UI real: /financeiro/registo → Secretaria busca aluno → PagamentosSecretariaPanel →
 * seleciona emolumento do catálogo → confirma. A página /financeiro/emolumentos é só leitura
 * para ALUNO — o registo é sempre pela Secretaria no Registo de Pagamentos.
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
    await page.goto(`${baseUrl}/financeiro/registo`);
    await page.waitForTimeout(1200);
    await shot(page, outputDir, `c${etiqueta}-emolumento-pagina`);

    // 1. Buscar o aluno pelo nome.
    const busca = page.locator("input#busca-registo-pagamentos");
    try {
      await busca.waitFor({ state: "visible", timeout: 15000 });
    } catch {
      return { ok: false, detalhe: "emolumento: campo de busca não encontrado em /financeiro/registo" };
    }
    await busca.fill(alunoNome);
    await page.waitForTimeout(1500);

    // 2. Clicar no primeiro resultado da busca.
    const primeiroResultado = page.locator("button, a", { hasText: alunoNome }).first();
    try {
      await primeiroResultado.waitFor({ state: "visible", timeout: 15000 });
    } catch {
      return { ok: false, detalhe: `emolumento: resultado da busca por "${alunoNome}" não apareceu` };
    }
    await primeiroResultado.click();
    await page.waitForTimeout(1500);
    await shot(page, outputDir, `c${etiqueta}-emolumento-aluno-selecionado`);

    // 3. O painel tem tabs Propinas/Emolumentos — trocar para a tab de emolumentos.
    const tabEmolumentos = page.locator("button", { hasText: "Emolumentos" }).first();
    if ((await tabEmolumentos.count()) > 0) {
      await tabEmolumentos.click();
      await page.waitForTimeout(800);
    }

    // 4. No catálogo da tab Emolumentos, selecionar o emolumento (checkbox dentro do label).
    const labelEmolumento = page.locator("label", { hasText: nomeEmolumento }).first();
    try {
      await labelEmolumento.waitFor({ state: "visible", timeout: 15000 });
    } catch {
      return { ok: false, detalhe: `emolumento: opção "${nomeEmolumento}" não encontrada no painel` };
    }
    const checkbox = labelEmolumento.locator("input[type='checkbox']");
    if ((await checkbox.count()) > 0 && !(await checkbox.isChecked())) {
      await checkbox.click();
    } else {
      await labelEmolumento.click();
    }
    await page.waitForTimeout(1000);
    await shot(page, outputDir, `c${etiqueta}-emolumento-selecionado`);

    // 5. Confirmar (botão "Confirmar e emitir recibo" — onClick, não type=submit).
    const submit = page.locator("button", { hasText: /Confirmar|emitir recibo/i }).last();
    try {
      await submit.waitFor({ state: "visible", timeout: 10000 });
      await submit.click();
      await page.waitForTimeout(1500);
    } catch {
      /* pode já ter sido submetido pelo clique anterior */
    }
    await shot(page, outputDir, `c${etiqueta}-emolumento-registado`);

    // Confirmação código-wise: Cobranca EMOLUMENTO criada para o aluno.
    const aluno = await prisma.aluno.findFirst({ where: { nome: alunoNome } });
    if (!aluno) return { ok: false, detalhe: `emolumento: aluno "${alunoNome}" não existe` };
    const cobranca = await prisma.cobranca.findFirst({
      where: { alunoId: aluno.id, tipo: "EMOLUMENTO" },
      orderBy: { createdAt: "desc" },
    });
    const ok = Boolean(cobranca);
    return {
      ok,
      detalhe: `${alunoNome}: emolumento "${nomeEmolumento}" ${cobranca ? `registado (${Number(cobranca.valorDevido)} Kz, ${cobranca.status}) — confirmado na BD` : "NÃO apareceu na BD"}`,
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
