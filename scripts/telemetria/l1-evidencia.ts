/**
 * L1 evidência final — relógio a funcionar.
 * Passo 1: ler data simulada. Recuar -10 dias (dentro da janela) → SECRETARIA cria aluno ✓
 * Passo 2: avançar +40 dias (fora da janela) → SECRETARIA bloqueada ✓ (claim 1.1)
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
import { chromium, type Page } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3001";
const OUT = path.join(process.cwd(), "scripts", "telemetria", "l1-evidencia");
mkdirSync(OUT, { recursive: true });
const SENHA = "Ispc@2026";

async function login(page: Page, email: string): Promise<void> {
  await page.goto(`${BASE}/login`, { timeout: 60000 });
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/senha/i).fill(SENHA);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });
}

async function saltarRelogio(page: Page, dias: string): Promise<string> {
  await page.goto(`${BASE}/admin/relogio`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const campo = page.locator('input[name="dias"], #dias').first();
  await campo.waitFor({ state: "visible", timeout: 20000 });
  await campo.fill(dias);
  await page.getByRole("button", { name: /avançar/i }).first().click();
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  return await page.locator("body").innerText();
}

/** Vai à página de novo aluno como secretaria e procura o erro de janela ou o formulário. */
async function testarNovoAluno(page: Page, screenshot: string): Promise<{ texto: string; url: string }> {
  await page.goto(`${BASE}/alunos`, { waitUntil: "domcontentloaded", timeout: 60000 });
  // procurar link/botão de novo aluno
  const candidatos = [
    'a[href*="novo"]',
    'a:has-text("Novo")',
    'a:has-text("Matricular")',
    'button:has-text("Novo")',
  ];
  for (const sel of candidatos) {
    const el = page.locator(sel).first();
    if ((await el.count()) > 0) {
      await el.click({ timeout: 10000 }).catch(() => {});
      break;
    }
  }
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.screenshot({ path: path.join(OUT, screenshot), fullPage: true });
  return { texto: await page.locator("body").innerText(), url: page.url() };
}

let findings = "";
function reg(claim: string, resultado: string): void {
  const linha = `[${claim}] ${resultado}`;
  console.log(linha);
  findings += linha + "\n";
}

async function main(): Promise<void> {
  const browser = await chromium.launch();

  const devCtx = await browser.newContext();
  const pD = await devCtx.newPage();
  await login(pD, "dev@ispc.ao");

  // ---- Estado inicial do relógio ----
  const corpo0 = await pD.locator("body").innerText();
  reg("relogio-inicial", corpo0.match(/Data simulada corrente[\s\S]{0,50}/)?.[0]?.replace(/\n+/g, " ") ?? "(?)");

  // ---- PASSO 1: recuar -10 dias → dentro da janela (3-19/Ago) ----
  const t1 = await saltarRelogio(pD, "-10");
  reg("salto--10d", t1.match(/Data simulada corrente[\s\S]{0,50}/)?.[0]?.replace(/\n+/g, " ") ?? "(?)");
  await pD.screenshot({ path: path.join(OUT, "04-relogio-dentro-janela.png"), fullPage: true });

  const secCtx = await browser.newContext();
  const pS = await secCtx.newPage();
  await login(pS, "secretaria@ispc.ao");
  const dentro = await testarNovoAluno(pS, "06-secretaria-DENTRO-janela.png");
  const erroDentro = dentro.texto.match(/Fora do período[^\n]*/);
  reg(
    "1.1-DENTRO",
    erroDentro ? `✗ SECRETARIA ainda bloqueada dentro da janela: "${erroDentro[0]}"` : `✓ formulário acessível (${dentro.url})`,
  );

  // ---- PASSO 2: avançar +60 dias → fora da janela (~20/Out) mas dentro do ano letivo ----
  const t2 = await saltarRelogio(pD, "70"); // volta a +60 líquido do -10
  reg("salto+70d", t2.match(/Data simulada corrente[\s\S]{0,50}/)?.[0]?.replace(/\n+/g, " ") ?? "(?)");
  await pD.screenshot({ path: path.join(OUT, "07-relogio-fora-janela.png"), fullPage: true });

  const fora = await testarNovoAluno(pS, "08-secretaria-FORA-janela.png");
  const erroFora = fora.texto.match(/Fora do período[^\n]*|Defina o período[^\n]*/);
  reg(
    "1.1-FORA",
    erroFora ? `✓ CONFIRMADO claim 1.1: "${erroFora[0]}"` : `✗ sem erro de janela visível (${fora.url})`,
  );

  await browser.close();
  writeFileSync(path.join(OUT, "findings.txt"), findings, "utf8");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
