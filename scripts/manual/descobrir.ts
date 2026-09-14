/**
 * Passagem de descoberta: entra com cada papel e lista o que a barra lateral lhe oferece, e o que
 * cada página mostra (título e botões principais).
 *
 * Existe para o catálogo de capturas (scripts/manual/paginas.ts) ser escrito a partir do que o
 * sistema REALMENTE tem, e não do que eu me lembro que tem — as rotas e os rótulos mudaram várias
 * vezes, e um guião escrito de memória falha em silêncio: a captura sai, mas da página errada.
 *
 * Usage: npx tsx scripts/manual/descobrir.ts [papel...]
 */
import { chromium, type Page } from "playwright";

const BASE = process.env.MANUAL_BASE_URL ?? "https://institutocrescente-code-spark1.vercel.app";
const SENHA = "Ispc@2026";

const CONTAS: { papel: string; identificador: string }[] = [
  { papel: "admin", identificador: "admin@ispc.ao" },
  { papel: "daac", identificador: "daac@ispc.ao" },
  { papel: "secretaria", identificador: "secretaria@ispc.ao" },
  { papel: "professor", identificador: "antonio.sousa@ispc.ao" },
  { papel: "estudante", identificador: "helder.zua@aluno.ispc.ao" },
  { papel: "dev", identificador: "dev@ispc.ao" },
];

async function entrar(page: Page, identificador: string): Promise<void> {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="identificador"]', identificador);
  await page.fill('input[name="password"]', SENHA);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 25_000 }).catch(() => {});
}

/** Abre todos os grupos da barra lateral — os itens de um grupo fechado não existem no DOM. */
async function abrirGrupos(page: Page): Promise<void> {
  const botoes = page.locator("aside button");
  const n = await botoes.count();
  for (let i = 0; i < n; i += 1) {
    await botoes.nth(i).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(120);
  }
}

async function main() {
  const pedidos = process.argv.slice(2);
  const contas = pedidos.length > 0 ? CONTAS.filter((c) => pedidos.includes(c.papel)) : CONTAS;

  const browser = await chromium.launch();

  for (const conta of contas) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-PT" });
    const page = await context.newPage();
    console.log(`\n${"=".repeat(70)}\n${conta.papel.toUpperCase()}  (${conta.identificador})\n${"=".repeat(70)}`);

    try {
      await entrar(page, conta.identificador);
    } catch (e) {
      console.log(`  LOGIN FALHOU: ${(e as Error).message.split("\n")[0]}`);
      await context.close();
      continue;
    }

    console.log(`  entrada em: ${new URL(page.url()).pathname}`);
    await abrirGrupos(page);

    const links = await page.evaluate(() => {
      const aside = document.querySelector("aside");
      if (!aside) return [];
      return Array.from(aside.querySelectorAll("a[href]")).map((a) => ({
        href: (a as HTMLAnchorElement).getAttribute("href") ?? "",
        texto: (a.textContent ?? "").trim(),
      }));
    });

    console.log(`\n  BARRA LATERAL (${links.length}):`);
    for (const l of links) console.log(`    ${l.href.padEnd(38)} ${l.texto}`);

    // Para cada rota, o título e os botões — é o que o manual precisa de nomear com exatidão.
    console.log(`\n  PÁGINAS:`);
    for (const l of links) {
      if (!l.href.startsWith("/")) continue;
      try {
        await page.goto(`${BASE}${l.href}`, { waitUntil: "domcontentloaded", timeout: 40_000 });
        await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
        const info = await page.evaluate(() => {
          const h1 = document.querySelector("h1")?.textContent?.trim() ?? "(sem h1)";
          const sub = document.querySelector("h1 + p")?.textContent?.trim() ?? "";
          const botoes = Array.from(document.querySelectorAll("main button, main a[href]"))
            .map((b) => (b.textContent ?? "").trim())
            .filter((t) => t.length > 0 && t.length < 42);
          const tabelas = document.querySelectorAll("table").length;
          const linhas = document.querySelectorAll("tbody tr").length;
          return { h1, sub, botoes: Array.from(new Set(botoes)).slice(0, 14), tabelas, linhas };
        });
        const destino = new URL(page.url()).pathname;
        const redir = destino !== l.href ? `  -> REDIRECIONOU para ${destino}` : "";
        console.log(`\n    ${l.href}${redir}`);
        console.log(`      h1: ${info.h1}`);
        if (info.sub) console.log(`      sub: ${info.sub.slice(0, 110)}`);
        console.log(`      tabelas: ${info.tabelas}, linhas: ${info.linhas}`);
        if (info.botoes.length > 0) console.log(`      acções: ${info.botoes.join(" | ")}`);
      } catch (e) {
        console.log(`\n    ${l.href}  ERRO: ${(e as Error).message.split("\n")[0]}`);
      }
    }

    await context.close();
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
