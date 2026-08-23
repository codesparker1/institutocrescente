/** Verificação visual do fix: botão "Nova matrícula" fora da janela (relógio em 20/10/2026). */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
import { chromium, type Page } from "playwright";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3001";
const OUT = path.join(process.cwd(), "scripts", "telemetria", "l1-evidencia");
const SENHA = "Ispc@2026";

async function login(page: Page, email: string): Promise<void> {
  await page.goto(`${BASE}/login`, { timeout: 60000 });
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/senha/i).fill(SENHA);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);

  await login(page, "secretaria@ispc.ao");

  // FORA da janela (relógio ~20/Out)
  await page.goto(`${BASE}/alunos`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, "12-botao-fora-janela.png"), fullPage: true });

  const btn = page.getByRole("button", { name: /nova matrícula/i });
  const desativado = await btn.isDisabled().catch(() => null);
  console.log("Botão disabled (fora):", desativado);
  const aviso = await page.locator("body").innerText();
  console.log("Aviso:", aviso.match(/Fora do período[^\n]*/)?.[0] ?? "(sem aviso)");

  // Tentar URL direto
  await page.goto(`${BASE}/alunos/novo`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, "13-novo-aluno-fora-janela.png"), fullPage: true });
  const corpo = await page.locator("body").innerText();
  console.log("URL direto mostra bloqueio:", /Fora do período|não configurado/.test(corpo) ? "SIM ✓" : "NÃO ✗");

  // DENTRO da janela: recuar relógio para 11/Ago como DEV
  const devCtx = await browser.newContext();
  const pD = await devCtx.newPage();
  await login(pD, "dev@ispc.ao");
  await pD.goto(`${BASE}/admin/relogio`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const campo = pD.locator('input[name="dias"], #dias').first();
  await campo.waitFor({ state: "visible", timeout: 30000 });
  // 20/Out → 11/Ago são -70 dias
  await campo.fill("-70");
  await pD.getByRole("button", { name: /avançar/i }).first().click();
  await pD.waitForTimeout(2000);

  // SECRETARIA vê o botão ativo agora?
  await page.goto(`${BASE}/alunos`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, "14-botao-dentro-janela.png"), fullPage: true });
  console.log("Botão disabled (dentro):", await btn.isDisabled().catch(() => null));
  const corpoDentro = await page.locator("body").innerText();
  console.log("Aviso dentro:", corpoDentro.match(/Fora do período[^\n]*/)?.[0] ?? "(nenhum — correto)");

  await browser.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
