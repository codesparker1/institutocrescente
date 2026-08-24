/**
 * Ações UI extra do teste-5-alunos-v2 — funcionalidades que o v1 não exercitava (gaps do ledger
 * docs/ledger-cobertura-simulacao.md):
 *
 *   - registo de aula + marcação de frequência (professor) — "frequência=0" no ledger;
 *   - alternar estado da multa via MultaChip (ADMIN) — "toggleMulta nunca testada";
 *   - reclamações: aluno submete via ReclamacaoForm, ADMIN resolve via AtualizarReclamacaoForm
 *     — rotas /reclamacoes e /admin/reclamacoes nunca abertas na simulação.
 *
 * Mesmo padrão de acoes-comuns.ts: dirige as Server Actions reais via Playwright, nunca escreve
 * na BD diretamente (a BD só é lida para localizar ids e CONFIRMAR o efeito após cada ação).
 */
import type { Browser, Page } from "playwright";
import path from "node:path";
import { login } from "../agentes/comum";
import { instrumentarPagina } from "../anomalias";
import type { CredencialAgente } from "../db-helpers";
import type { PrismaClient } from "../../../src/generated/prisma/client";

/** Screenshot JPEG (q70) — evidência visual sem rebentar o disco em corridas de 4 anos. */
export async function shot(page: Page, outputDir: string, nome: string): Promise<void> {
  try {
    await page.screenshot({ path: path.join(outputDir, `${nome}.jpg`), fullPage: true, type: "jpeg", quality: 70 });
  } catch {
    /* a página pode já ter fechado — não perder a corrida por uma imagem */
  }
}

export interface ResultadoAula {
  aulasCriadas: number;
  frequenciasMarcadas: number;
  detalhe: string;
}

/**
 * Percorre as disciplinas do professor (tabela /professor) e, em cada pauta onde HOJE é dia de
 * aula e ainda não há aula registada, cria a aula (CreateAulaForm → createAulaAction) e marca o
 * aluno como PRESENTE (AttendanceChip → toggleFrequenciaAction). Se hoje não é dia de aula,
 * reporta honestamente — isso também é comportamento do sistema a testar.
 */
export async function registarAulaEFrequencia(
  browser: Browser,
  baseUrl: string,
  professorCredencial: CredencialAgente,
  outputDir: string,
  alunoNome: string,
  etiqueta: string,
): Promise<ResultadoAula> {
  const ctxBrowser = await browser.newContext();
  const page = await ctxBrowser.newPage();
  instrumentarPagina(page, outputDir, professorCredencial.papel);
  const res: ResultadoAula = { aulasCriadas: 0, frequenciasMarcadas: 0, detalhe: "" };
  const naoDiaDeAula: string[] = [];

  try {
    await login(page, baseUrl, professorCredencial);
    await page.goto(`${baseUrl}/professor`);
    const linhas = page.locator("table tbody tr");
    const total = await linhas.count();

    for (let i = 0; i < total; i += 1) {
      await page.goto(`${baseUrl}/professor`);
      const link = linhas.nth(i).locator("a").first();
      if ((await link.count()) === 0) continue;
      await Promise.all([page.waitForURL(/\/professor\/.+/, { timeout: 90000 }), link.click()]);

      const botaoAula = page.getByRole("button", { name: /Adicionar aula de hoje/i });
      if ((await botaoAula.count()) === 0 || !(await botaoAula.first().isEnabled())) {
        // Gradebook diz "Hoje (X) não é dia de aula" ou a aula de hoje já existe.
        naoDiaDeAula.push((await page.title()).trim() || `disciplina ${i + 1}`);
        continue;
      }
      await botaoAula.first().click();
      await page.waitForTimeout(1500);
      res.aulasCriadas += 1;

      // Chip de frequência do aluno — botão cujo texto contém o nome (suffixo "(inativo)" não existe aqui).
      const chip = page.getByRole("button", { name: alunoNome }).first();
      if ((await chip.count()) > 0 && (await chip.isEnabled())) {
        await chip.click();
        await page.waitForTimeout(800);
        res.frequenciasMarcadas += 1;
      }
      await shot(page, outputDir, `c${etiqueta}-aula-frequencia`);
    }
  } catch (erro) {
    res.detalhe = `ERRO: ${(erro as Error).message.slice(0, 140)}`;
  } finally {
    await ctxBrowser.close();
  }

  if (!res.detalhe) {
    res.detalhe =
      res.aulasCriadas > 0
        ? `${res.aulasCriadas} aula(s) criada(s), ${res.frequenciasMarcadas} frequência(s) marcada(s) para ${alunoNome}`
        : `nenhuma disciplina com dia de aula hoje (${naoDiaDeAula.length} pauta(s) vista(s))`;
  }
  return res;
}

export interface ResultadoMulta {
  ok: boolean;
  detalhe: string;
}

/**
 * Alterna a multa órfã PENDENTE mais recente do aluno via MultaChip na ficha (/alunos/[id]) como
 * ADMIN — a única rota onde o chip existe (SECRETARIA não vê o toggle; poder exclusivo de ADMIN,
 * regra 2026-08). NOTA: a secção "Multas por atraso" da ficha só lista multas ÓRFÃS
 * (mesReferencia=null — ver multasOrfas em /alunos/[id]/page.tsx); as multas mensais do João vivem
 * dentro das linhas de PropinasMensais e não têm chip próprio. Por isso o alvo certo é a multa
 * órfã que o cenário do Domingos cria na rematrícula tardia. Clica UMA vez (PENDENTE → PAGO) e
 * confirma o efeito na BD.
 */
export async function alternarMultaComoAdmin(
  browser: Browser,
  baseUrl: string,
  adminCredencial: CredencialAgente,
  prisma: PrismaClient,
  alunoEmail: string,
  alunoNomeCurto: string,
  outputDir: string,
  etiqueta: string,
): Promise<ResultadoMulta> {
  const aluno = await prisma.aluno.findFirst({
    where: { user: { email: alunoEmail } },
    include: { cobrancas: { where: { tipo: "MULTA", status: "PENDENTE", mesReferencia: null }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!aluno || aluno.cobrancas.length === 0) {
    return { ok: false, detalhe: `${alunoNomeCurto}: sem multa PENDENTE para alternar` };
  }
  const multaId = aluno.cobrancas[0].id;

  const ctxBrowser = await browser.newContext();
  const page = await ctxBrowser.newPage();
  instrumentarPagina(page, outputDir, adminCredencial.papel);
  try {
    await login(page, baseUrl, adminCredencial);
    await page.goto(`${baseUrl}/alunos/${aluno.id}`);
    const secaoMultas = page.locator("div.flex.flex-col.gap-2").filter({ hasText: "Multas por atraso" }).first();
    try {
      await secaoMultas.waitFor({ state: "visible", timeout: 15000 });
    } catch {
      return { ok: false, detalhe: `${alunoNomeCurto}: secção "Multas por atraso" não apareceu na ficha em 15s` };
    }
    const chip = secaoMultas.locator("button", { hasText: "Pendente" }).first();
    if ((await chip.count()) === 0) {
      return { ok: false, detalhe: `${alunoNomeCurto}: chip Pendente não encontrado na ficha (UI mudou?)` };
    }
    await shot(page, outputDir, `c${etiqueta}-multa-antes`);
    await chip.click();
    await page.waitForTimeout(1200);
    await shot(page, outputDir, `c${etiqueta}-multa-depois`);

    // Confirmação código-wise: a BD tem de mostrar PAGO agora.
    const depois = await prisma.cobranca.findUnique({ where: { id: multaId } });
    const pago = depois?.status === "PAGO";
    return {
      ok: pago,
      detalhe: `${alunoNomeCurto}: toggleMulta PENDENTE→${depois?.status ?? "?"} via MultaChip (${pago ? "confirmado na BD" : "BD NÃO refletiu"})`,
    };
  } catch (erro) {
    return { ok: false, detalhe: `${alunoNomeCurto}: ERRO toggleMulta: ${(erro as Error).message.slice(0, 140)}` };
  } finally {
    await ctxBrowser.close();
  }
}

/**
 * Aluno submete uma reclamação/sugestão via /reclamacoes (ReclamacaoForm → criarReclamacaoAction).
 */
export async function submeterReclamacao(
  browser: Browser,
  baseUrl: string,
  credencial: CredencialAgente,
  prisma: PrismaClient,
  outputDir: string,
  etiqueta: string,
  assunto: string,
  mensagem: string,
): Promise<ResultadoMulta> {
  const ctxBrowser = await browser.newContext();
  const page = await ctxBrowser.newPage();
  instrumentarPagina(page, outputDir, credencial.papel);
  try {
    await login(page, baseUrl, credencial);
    await page.goto(`${baseUrl}/reclamacoes`);
    await page.locator("#categoria").selectOption("RECLAMACAO");
    await page.fill("#assunto", assunto);
    await page.fill("#mensagem", mensagem);
    await shot(page, outputDir, `c${etiqueta}-reclamacao-form`);
    await page.getByRole("button", { name: /Enviar/i }).click();
    await page.waitForTimeout(1200);

    const enviou = (await page.getByText(/Enviado\. Obrigado pelo feedback/i).count()) > 0;
    const naBD = await prisma.reclamacao.findFirst({ where: { assunto, status: "PENDENTE" } });
    await shot(page, outputDir, `c${etiqueta}-reclamacao-enviada`);
    return {
      ok: enviou && Boolean(naBD),
      detalhe: `reclamação "${assunto}" submetida (${enviou ? "confirmação visível" : "SEM confirmação visível"}, ${naBD ? "gravada na BD" : "NÃO gravada"})`,
    };
  } catch (erro) {
    return { ok: false, detalhe: `ERRO submeter reclamação: ${(erro as Error).message.slice(0, 140)}` };
  } finally {
    await ctxBrowser.close();
  }
}

/**
 * DEV resolve a reclamação pendente dada via /admin/reclamacoes (AtualizarReclamacaoForm →
 * atualizarReclamacaoAction), com resposta ao aluno — fecha o ciclo L5 comunicação. NOTA: a página
 * exige papel DEV (session.user.role !== "DEV" → redirect /dashboard, visto 2026-08-24) — o ADMIN
 * é redirecionado, por isso quem resolve aqui é o dev@ispc.ao.
 */
export async function resolverReclamacaoComoAdmin(
  browser: Browser,
  baseUrl: string,
  devCredencial: CredencialAgente,
  prisma: PrismaClient,
  outputDir: string,
  etiqueta: string,
  assunto: string,
  resposta: string,
): Promise<ResultadoMulta> {
  const rec = await prisma.reclamacao.findFirst({ where: { assunto, status: "PENDENTE" } });
  if (!rec) return { ok: false, detalhe: `reclamação "${assunto}" não está PENDENTE — nada a resolver` };

  const ctxBrowser = await browser.newContext();
  const page = await ctxBrowser.newPage();
  instrumentarPagina(page, outputDir, devCredencial.papel);
  try {
    await login(page, baseUrl, devCredencial);
    await page.goto(`${baseUrl}/admin/reclamacoes`);

    // O form da reclamação certa: hidden input name=id value=<rec.id>. Server component — espera
    // pelo form renderizar (contra a Vercel demora segundos).
    const form = page.locator(`form:has(input[name="id"][value="${rec.id}"])`).first();
    try {
      await form.waitFor({ state: "visible", timeout: 15000 });
    } catch {
      return { ok: false, detalhe: `/admin/reclamacoes não mostra o form da reclamação "${assunto}" em 15s (URL caiu em ${page.url()})` };
    }
    await form.locator('select[name="status"]').selectOption("RESOLVIDO");
    await form.locator('textarea[name="resposta"]').fill(resposta);
    await shot(page, outputDir, `c${etiqueta}-reclamacao-resolvendo`);
    await form.getByRole("button", { name: /Guardar/i }).click();
    await page.waitForTimeout(1200);

    const depois = await prisma.reclamacao.findUnique({ where: { id: rec.id } });
    const resolvido = depois?.status === "RESOLVIDO" && depois?.resposta === resposta;
    await shot(page, outputDir, `c${etiqueta}-reclamacao-resolvida`);
    return {
      ok: resolvido,
      detalhe: `ADMIN resolveu "${assunto}" → ${depois?.status ?? "?"} (${resolvido ? "status+resposta confirmados na BD" : "BD NÃO refletiu"})`,
    };
  } catch (erro) {
    return { ok: false, detalhe: `ERRO resolver reclamação: ${(erro as Error).message.slice(0, 140)}` };
  } finally {
    await ctxBrowser.close();
  }
}
