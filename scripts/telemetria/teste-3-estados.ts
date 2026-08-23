/** Teste visual do estado de 3 fases: relógio avança para gerar meses Devendo vs Aguardando vs Pago. */
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

async function main(): Promise<void> {
  // Estado da BD antes: primeiro aluno com cobranças
  const aluno = await prisma.aluno.findFirst({ select: { id: true, nome: true, numeroEstudante: true } });
  console.log("Aluno alvo:", aluno?.nome, aluno?.numeroEstudante);

  const browser = await chromium.launch();

  const devCtx = await browser.newContext();
  const pD = await devCtx.newPage();
  await login(pD, "dev@ispc.ao");

  const secCtx = await browser.newContext();
  const pS = await secCtx.newPage();
  await login(pS, "secretaria@ispc.ao");

  // Relógio atual
  await pD.goto(`${BASE}/admin/relogio`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const corpo = await pD.locator("body").innerText();
  console.log("Relógio:", corpo.match(/Data simulada corrente[\s\S]{0,40}/)?.[0]?.replace(/\n+/g, " "));

  // Ficha do aluno como secretaria — ANTES do salto (11/Ago: tudo Aguardando/Pago)
  await pS.goto(`${BASE}/alunos/${aluno!.id}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pS.waitForTimeout(2000);
  await pS.screenshot({ path: path.join(OUT, "20-financas-antes.png"), fullPage: true });

  // Avançar +90 dias → ~09/Nov: meses Ago/Set/Out vencidos (vencimento dia 10)
  await saltar(pD, "90");
  console.log("Saltado +90 dias");
  await pS.goto(`${BASE}/alunos/${aluno!.id}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pS.waitForTimeout(2500); // dar tempo ao job preguiçoso (garantirCobrancasGeradas)
  await pS.reload({ waitUntil: "domcontentloaded" });
  await pS.waitForTimeout(2000);
  await pS.screenshot({ path: path.join(OUT, "21-financas-devendo.png"), fullPage: true });

  const texto = await pS.locator("body").innerText();
  const devendo = (texto.match(/Devendo/g) ?? []).length;
  const aguardando = (texto.match(/Aguarda vencimento/g) ?? []).length;
  const pago = (texto.match(/Pago/g) ?? []).length;
  console.log(`Contagem na ficha: Devendo=${devendo} | Aguardando=${aguardando} | Pago=${pago}`);

  // Pagar o mês mais antigo em atraso via toggle? Não — usar o próprio painel da secretaria é
  // complexo; aqui basta evidenciar os três estados visuais. Marcar um como pago direto na BD:
  const pendenteMaisAntiga = await prisma.cobranca.findFirst({
    where: { alunoId: aluno!.id, tipo: "PROPINA", status: "PENDENTE" },
    orderBy: { mesReferencia: "asc" },
  });
  if (pendenteMaisAntiga) {
    await prisma.cobranca.update({
      where: { id: pendenteMaisAntiga.id },
      data: { status: "PAGO", valorPago: pendenteMaisAntiga.valorDevido, dataPagamento: new Date() },
    });
    console.log("Mês mais antigo pago na BD:", pendenteMesLabel(pendenteMaisAntiga.mesReferencia));
  }
  await pS.reload({ waitUntil: "domcontentloaded" });
  await pS.waitForTimeout(2000);
  await pS.screenshot({ path: path.join(OUT, "22-financas-mistos.png"), fullPage: true });

  const texto2 = await pS.locator("body").innerText();
  console.log(
    `Depois do pagamento: Devendo=${(texto2.match(/Devendo/g) ?? []).length} | Aguardando=${(texto2.match(/Aguarda vencimento/g) ?? []).length} | Pago=${(texto2.match(/Pago/g) ?? []).length}`,
  );

  await browser.close();
  await prisma.$disconnect();
}

function pendenteMesLabel(d: Date | null): string {
  return d ? d.toISOString().slice(0, 7) : "?";
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
