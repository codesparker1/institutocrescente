/** Submissão com espera longa — o server action pode demorar no dev server lento. */
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

  await page.goto(`${BASE}/alunos/novo`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByLabel(/nome/i).fill("Teste Janela Fora 2");
  await page.locator("select").nth(0).selectOption({ index: 5 });
  await page.locator("select").nth(1).selectOption({ index: 1 });
  await page.locator("select").nth(2).selectOption({ label: "2004" }).catch(() => {});

  // Submeter e esperar pela resposta da action (sem networkidle, que morre com streams)
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST", { timeout: 90000 }).catch(() => null),
    page.getByRole("button", { name: /guardar/i }).click(),
  ]);
  console.log("POST status:", resp?.status() ?? "(sem resposta)");
  if (resp) {
    try {
      const corpo = await resp.text();
      console.log("corpo POST (500 chars):", corpo.slice(0, 500));
    } catch {}
  }

  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, "11-apos-submissao-espera.png"), fullPage: true });
  const texto = await page.locator("body").innerText();
  const erro = texto.match(/Fora do período[^\n]*|Defina o período[^\n]*/);
  const sucesso = texto.match(/ISPC\d{4}-\d{4}/);
  console.log(erro ? `ERRO DE JANELA: ${erro[0]}` : "Sem erro de janela na página.");
  console.log(sucesso ? `ALUNO CRIADO: ${sucesso[0]}` : "Sem nº de estudante visível.");

  await browser.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
