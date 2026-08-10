/**
 * Full functional workflow test against the running `npm run dev` server, driven through
 * a real Chromium browser (Playwright) so it exercises the actual Server Action forms —
 * not raw HTTP, since almost every mutation in this app (create aluno, lançar nota,
 * confirmar propina) is a Next.js Server Action with no plain API route twin.
 *
 * Flow:
 *   1. Admin logs in, creates a new aluno via the real "Nova Matrícula" form.
 *   2. (No UI exists for turma enrollment or propina creation — db-helpers.mjs does
 *      those two inserts directly via Prisma, reusing the seeded turma/avaliação.)
 *   3. Professor logs in, grades both the new aluno and the seeded in-debt aluno
 *      (aluno@ispc.ao) on "1.ª Prova".
 *   4. Secretaria logs in, confirms the new aluno's propina as PAGO — leaves
 *      aluno@ispc.ao's seeded overdue propina untouched (stays PENDENTE).
 *   5. Downloads the Lista de Presença PDF for that avaliação and checks the new aluno
 *      is listed while aluno@ispc.ao is excluded (debt-blocking logic in src/lib/financeiro.ts).
 *
 * Usage: node scripts/e2e-workflow/run.mjs [--url http://localhost:3000] [--timeout 60000]
 */
import { chromium, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import { getSeededContext, matricularNovoAlunoComPropinaPendente, disconnect } from "./db-helpers";

const DEMO_PASSWORD = "Ispc@2026";
const DEMO_EMAILS = {
  admin: "admin@ispc.ao",
  secretaria: "secretaria@ispc.ao",
  professor: "professor@ispc.ao",
  aluno: "aluno@ispc.ao",
};

type Role = keyof typeof DEMO_EMAILS;

function parseArgs(argv: string[]) {
  const args = { url: "http://localhost:3000", timeout: 60000 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--url") args.url = argv[i + 1];
    if (argv[i] === "--timeout") args.timeout = Number(argv[i + 1]);
  }
  return args;
}

async function login(page: Page, baseUrl: string, role: Role) {
  await page.goto(`${baseUrl}/login`);
  await page.fill("#email", DEMO_EMAILS[role]);
  await page.fill("#password", DEMO_PASSWORD);
  await Promise.all([page.waitForURL(/\/dashboard/, { timeout: 60000 }), page.click('button[type="submit"]')]);
  console.log(`  logado como ${role} (${DEMO_EMAILS[role]})`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const novoEmail = `teste.e2e.${Date.now()}@aluno.ispc.ao`;
  const novoNome = "Aluno Teste E2E";

  console.log("A ler contexto seedado (turma, disciplina, avaliação, aluno em dívida)...");
  const ctx = await getSeededContext();
  console.log(`  turma=${ctx.turma.id} turmaDisciplina=${ctx.turmaDisciplina.id} avaliacao="${ctx.avaliacao.nome}"`);
  console.log(`  aluno em dívida (seed): ${ctx.alunoEmDivida.nome} <${ctx.alunoEmDivida.email}>`);
  if (!ctx.bloqueioAtivo) {
    console.log("  AVISO: bloqueioAtivo está desligado na ConfiguracaoFinanceira — a exclusão do PDF não vai acontecer.");
  }

  const browser = await chromium.launch();
  const context = await browser.newContext();
  context.setDefaultTimeout(args.timeout);
  context.setDefaultNavigationTimeout(args.timeout);
  const page = await context.newPage();

  try {
    console.log("\n[1/5] Admin cria um novo aluno...");
    await login(page, args.url, "admin");
    await page.goto(`${args.url}/alunos/novo`);
    await page.fill("#nome", novoNome);
    await page.fill("#email", novoEmail);
    await page.fill("#telefone", "923111222");
    await page.fill("#dataNascimento", "2004-05-15");
    await page.selectOption("#genero", "Feminino");
    await page.selectOption("#curso", "Engenharia Informática");
    await page.fill("#anoIngresso", String(new Date().getFullYear()));
    await page.selectOption("#anoCurricular", "1");
    await Promise.all([page.waitForURL(/\/alunos\//, { timeout: args.timeout }), page.click('button[type="submit"]')]);
    console.log(`  aluno criado: ${novoNome} <${novoEmail}>`);

    console.log("\n  (matriculando o novo aluno na turma seedada e criando a propina pendente — sem UI para isto)");
    const { aluno: novoAluno, propina: novaPropina } = await matricularNovoAlunoComPropinaPendente(
      novoEmail,
      ctx.turma.id,
    );
    console.log(`  matriculado (matriculaId via propina.matriculaId), propinaId=${novaPropina.id}`);

    console.log("\n[2/5] Professor lança notas na 1.ª Prova para os dois alunos...");
    await login(page, args.url, "professor");
    await page.goto(`${args.url}/professor/${ctx.turmaDisciplina.id}`);

    async function lancarNota(nomeAluno: string, valor: number) {
      const linha = page.locator("tbody tr", { hasText: nomeAluno });
      await linha.waitFor({ state: "visible" });
      const primeiraColunaNota = linha.locator('input[type="number"]').first();
      await primeiraColunaNota.fill(String(valor));
      await primeiraColunaNota.blur();
      await page.waitForTimeout(500);
    }
    await lancarNota(ctx.alunoEmDivida.nome, 14);
    await lancarNota(novoNome, 16);
    console.log("  notas lançadas para ambos os alunos");

    console.log("\n[3/5] Secretaria confirma o pagamento do novo aluno (deixa o outro por pagar)...");
    await login(page, args.url, "secretaria");
    await page.goto(`${args.url}/financeiro/registo?q=${encodeURIComponent(novoNome)}`);
    await page.click(`a:has-text("${novoNome}")`);
    await page.waitForURL(/alunoId=/);
    const chipPendente = page.locator("button", { hasText: "Pendente" }).first();
    await chipPendente.click();
    await page.waitForTimeout(500);
    console.log(`  propina de ${novoNome} confirmada como PAGO`);

    console.log("\n[4/5] A descarregar a Lista de Presença em PDF (via sessão da secretaria)...");
    const pdfUrl = `${args.url}/api/lista-presenca/${ctx.avaliacao.id}`;
    const response = await context.request.get(pdfUrl, { timeout: args.timeout });
    if (!response.ok()) {
      throw new Error(`PDF request falhou: HTTP ${response.status()}`);
    }
    const pdfBuffer = await response.body();

    const logsDir = path.join(process.cwd(), "e2e-logs");
    await mkdir(logsDir, { recursive: true });
    const pdfPath = path.join(logsDir, `lista-presenca-${Date.now()}.pdf`);
    await writeFile(pdfPath, pdfBuffer);
    console.log(`  PDF guardado em: ${pdfPath}`);

    console.log("\n[5/5] A verificar o conteúdo do PDF...");
    const parser = new PDFParse({ data: pdfBuffer });
    const parsed = await parser.getText();
    await parser.destroy();
    const contemNovoAluno = parsed.text.includes(novoNome);
    const contemAlunoEmDivida = parsed.text.includes(ctx.alunoEmDivida.nome);

    console.log(`  "${novoNome}" (pago) presente na lista: ${contemNovoAluno ? "SIM ✅" : "NÃO ❌"}`);
    console.log(`  "${ctx.alunoEmDivida.nome}" (em dívida) presente na lista: ${contemAlunoEmDivida ? "SIM ❌ (devia estar excluído)" : "NÃO ✅ (excluído corretamente)"}`);

    const sucesso = contemNovoAluno && !contemAlunoEmDivida;
    console.log(`\nResultado global: ${sucesso ? "✅ FLUXO COMPLETO FUNCIONOU COMO ESPERADO" : "❌ HÁ UMA DIVERGÊNCIA — ver acima"}`);
    process.exitCode = sucesso ? 0 : 1;
  } finally {
    await browser.close();
    await disconnect();
  }
}

main().catch((error) => {
  console.error("\nTeste de fluxo falhou com um erro:", error);
  process.exitCode = 1;
});
