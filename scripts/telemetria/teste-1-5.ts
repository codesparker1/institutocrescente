/**
 * Claim 1.5 — anoLetivoFim dispara o fecho do ano: rollover de turmas, suspensão dos não
 * rematriculados, semestre → 1. Teste ao vivo com o relógio simulado.
 *
 * Estado atual (verificado): 5 alunos ATIVO, 1 turma (2026), anoLetivoFim = 14/07/2027,
 * semestreAtual = 1. Plano:
 *   1. DEV põe semestreAtual=2 na config (via UI seria melhor, mas via BD para o teste — o job
 *      tem de o repor a 1; se ficar 1, não há sinal visível dessa parte).
 *   2. Avançar relógio para ~14/08/2027 (um mês depois do fim).
 *   3. Aceder ao dashboard → job preguiçoso corre → verificar:
 *      - turma nova de 2027 criada (com TurmaDisciplinas copiadas)
 *      - alunos não rematriculados → TRANCADO
 *      - semestreAtual voltou a 1
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
import { chromium, type Page } from "playwright";
import path from "node:path";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = path.join(process.cwd(), "scripts", "telemetria", "l1-evidencia");
const SENHA = "Ispc@2026";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function login(page: Page, email: string): Promise<void> {
  await page.goto(`${BASE}/login`, { timeout: 60000 });
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/senha/i).fill(SENHA);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });
}

async function saltar(page: Page, dias: string): Promise<void> {
  await page.goto(`${BASE}/admin/relogio`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const campo = page.locator('input[name="dias"], #dias').first();
  await campo.waitFor({ state: "visible", timeout: 30000 });
  await campo.fill(dias);
  await page.getByRole("button", { name: /avançar/i }).first().click();
  await page.waitForTimeout(2500);
}

let findings = "";
function reg(claim: string, resultado: string): void {
  const linha = `[1.5] ${claim}: ${resultado}`;
  console.log(linha);
  findings += linha + "\n";
}

async function main(): Promise<void> {
  // --- estado ANTES ---
  const turmasAntes = await prisma.turma.findMany({ orderBy: { anoLetivo: "desc" }, select: { id: true, anoLetivo: true } });
  const ativosAntes = await prisma.aluno.count({ where: { status: "ATIVO" } });
  reg("antes", `turmas=${JSON.stringify(turmasAntes.map((t) => t.anoLetivo))}, alunos ATIVO=${ativosAntes}`);

  // pôr semestreAtual=2 para provar que o job o repõe
  await prisma.configuracaoAcademica.update({ where: { id: "config" }, data: { semestreAtual: 2 } });
  reg("setup", "semestreAtual forçado a 2 (o job deve repor a 1)");

  const browser = await chromium.launch();
  const devCtx = await browser.newContext();
  const pD = await devCtx.newPage();
  await login(pD, "dev@ispc.ao");

  // relógio está em ~11/Ago/2026 (do teste anterior). anoLetivoFim = 14/Jul/2027 → saltar +365 dias
  await saltar(pD, "365");
  const corpoRelogio = await pD.locator("body").innerText();
  reg("relogio", corpoRelogio.match(/Data simulada corrente[\s\S]{0,40}/)?.[0]?.replace(/\n+/g, " ") ?? "(?)");

  // acionar o job preguiçoso: acessos ao dashboard
  const admCtx = await browser.newContext();
  const pA = await admCtx.newPage();
  await login(pA, "admin@ispc.ao");
  await pA.waitForTimeout(4000); // dar tempo ao after() correr
  await pA.reload({ waitUntil: "domcontentloaded" });
  await pA.waitForTimeout(4000);
  await pA.screenshot({ path: path.join(OUT, "30-apos-fecho-ano.png"), fullPage: true });

  // pequena espera extra e segunda passagem (job pode ter sido reclamado mas after ainda a correr)
  await pA.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pA.waitForTimeout(5000);

  // --- estado DEPOIS ---
  const turmasDepois = await prisma.turma.findMany({ orderBy: { anoLetivo: "desc" }, select: { id: true, anoLetivo: true } });
  reg(
    "rollover-turmas",
    turmasDepois.some((t) => t.anoLetivo === 2027)
      ? `✓ turma 2027 criada (${JSON.stringify(turmasDepois.map((t) => t.anoLetivo))})`
      : `✗ nenhuma turma 2027 (${JSON.stringify(turmasDepois.map((t) => t.anoLetivo))})`,
  );

  const [ativos, trancados] = await Promise.all([
    prisma.aluno.count({ where: { status: "ATIVO" } }),
    prisma.aluno.count({ where: { status: "TRANCADO" } }),
  ]);
  reg(
    "suspensao",
    trancados > 0 || ativos < ativosAntes
      ? `✓ suspensão ocorreu: ATIVO ${ativosAntes}→${ativos}, TRANCADO=${trancados}`
      : `✗ ninguém suspenso (ATIVO=${ativos}, TRANCADO=${trancados})`,
  );

  const cfg = await prisma.configuracaoAcademica.findUnique({ where: { id: "config" }, select: { semestreAtual: true } });
  reg("semestre-reset", cfg?.semestreAtual === 1 ? "✓ semestreAtual reposto a 1" : `✗ semestreAtual=${cfg?.semestreAtual}`);

  writeFileSyncFindings();
  await browser.close();
  await prisma.$disconnect();
}

function writeFileSyncFindings(): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("node:fs").writeFileSync(path.join(OUT, "findings-1.5.txt"), findings, "utf8");
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
